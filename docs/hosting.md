# Where it lives and how it's released

> The engine isn't a site: it's a GitHub repository with tagged versions that apps install. This is how a version goes
> out and how an app moves to it.

---

## {0} Where it is

- [ ] **Repository:** github.com/blaziikun/tier-engine, branch `main`, public, MIT.
- [ ] **Versions:** git tags `vX.Y.Z`. A tag ruleset stops a released tag being moved or deleted.
- [ ] **CI** (.github/workflows/ci.yml): secrets scan, identity guard, then lint, types, dead code and unit tests.
      No deploy: there's nothing to deploy.
- [ ] **npm:** not yet. Once a second app uses it, publish with provenance from CI.

## {1} Releasing a version

```sh
cd ~/Developer/tierinator/tier-engine
pnpm verify && pnpm guard
# in package.json: "version": "X.Y.Z"; in CHANGELOG.md: what changed (breaking changes first)
git add -A && git ci -m "tier-engine X.Y.Z: …"
git tag vX.Y.Z && git push && git push origin vX.Y.Z
```

Then in each app:

```sh
pnpm add github:blaziikun/tier-engine#vX.Y.Z
pnpm verify && pnpm test:e2e
git add package.json pnpm-lock.yaml && git ci -m "tier-engine X.Y.Z" && git push
```

## {2} Working against an unreleased engine

```sh
cd ../tierinator && pnpm add tier-engine@link:../tier-engine   # don't commit this
```

Put the tag back (`pnpm add github:blaziikun/tier-engine#vX.Y.Z`) before committing the app.
