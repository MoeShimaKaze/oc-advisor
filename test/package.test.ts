import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type PackageJson = {
  readonly version: string;
  readonly main?: string;
  readonly module?: string;
  readonly exports?: Readonly<Record<string, unknown>>;
  readonly scripts?: Readonly<Record<string, string | undefined>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly peerDependenciesMeta?: Readonly<
    Record<string, { readonly optional?: boolean }>
  >;
  readonly homepage?: string;
  readonly repository?: { readonly type?: string; readonly url?: string };
  readonly bugs?: { readonly url?: string };
};

type Lockfile = {
  readonly packages?: Readonly<Record<string, readonly unknown[]>>;
};

const root = resolve(import.meta.dir, "..");
const pkg: PackageJson = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);
// bun.lock is JSONC (allows trailing commas); strip them before parsing.
const lock: Lockfile = JSON.parse(
  readFileSync(resolve(root, "bun.lock"), "utf8").replace(
    /,(\s*[}\]])/g,
    "$1",
  ),
);
const opencodeConfig: Readonly<Record<string, unknown>> = JSON.parse(
  readFileSync(resolve(root, "opencode.json"), "utf8"),
);

function allDependencyEntries(): readonly [
  string,
  string,
][] {
  return [
    ...Object.entries(pkg.dependencies ?? {}),
    ...Object.entries(pkg.devDependencies ?? {}),
    ...Object.entries(pkg.peerDependencies ?? {}),
  ];
}

describe("package metadata (T03)", () => {
  test("version is 0.2.0", () => {
    expect(pkg.version).toBe("0.2.0");
  });

  test("declares exact V2 runtime dependency @opencode/plugin@2.0.24", () => {
    expect(pkg.dependencies?.["@opencode/plugin"]).toBe("2.0.24");
  });

  test("has no V1 @opencode-ai/* dependencies", () => {
    const v1 = allDependencyEntries().filter(([name]) =>
      name.startsWith("@opencode-ai/"),
    );
    expect(v1).toEqual([]);
  });

  test("package entry resolves to dist/plugin.js", () => {
    expect(pkg.main).toBe("./dist/plugin.js");
    expect(pkg.module).toBe("./dist/plugin.js");
    expect(pkg.exports?.["."]).toBeDefined();
    expect(JSON.stringify(pkg.exports?.["."])).toContain("./dist/plugin.js");
  });

  test("prepare script builds the plugin for Git installs", () => {
    expect(pkg.scripts?.["prepare"]).toBeDefined();
    expect(pkg.scripts?.["prepare"]).toContain("build");
  });

  test("build:plugin bundles the V2 entry", () => {
    const script = pkg.scripts?.["build:plugin"] ?? "";
    expect(script).toContain(".opencode/plugins/advisor.ts");
    expect(script).toContain("dist/plugin.js");
  });

  test("build:plugin externalizes @opencode/plugin and not V1 packages", () => {
    const script = pkg.scripts?.["build:plugin"] ?? "";
    expect(script).toContain("--external @opencode/plugin");
    expect(script).not.toContain("@opencode-ai/plugin");
    expect(script).not.toContain("@opencode-ai/sdk");
  });
});

describe("lockfile (T03)", () => {
  test("resolves @opencode/plugin to exactly 2.0.24", () => {
    const entry = lock.packages?.["@opencode/plugin"];
    expect(entry).toBeDefined();
    expect(entry?.[0]).toBe("@opencode/plugin@2.0.24");
  });

  test("does not resolve V1 @opencode-ai packages", () => {
    const keys = Object.keys(lock.packages ?? {});
    expect(keys.some((k) => k.startsWith("@opencode-ai/"))).toBe(false);
  });
});

describe("project config (T03)", () => {
  test("opencode.json contains only $schema", () => {
    expect(Object.keys(opencodeConfig)).toEqual(["$schema"]);
    expect(opencodeConfig["$schema"]).toBe("https://opencode.ai/config.json");
  });
});

describe("repository metadata (T03 fix 1)", () => {
  test("homepage points at the authorized target repo", () => {
    expect(pkg.homepage).toBe("https://github.com/MoeShimaKaze/oc-advisor");
  });

  test("repository url points at the authorized target repo", () => {
    expect(pkg.repository?.type).toBe("git");
    expect(pkg.repository?.url).toBe(
      "git+https://github.com/MoeShimaKaze/oc-advisor.git",
    );
  });

  test("bugs url points at the authorized target repo issues", () => {
    expect(pkg.bugs?.url).toBe(
      "https://github.com/MoeShimaKaze/oc-advisor/issues",
    );
  });
});
