# Versioning and releases

OpenBijli ships one version number for the whole repository: the npm packages
(`@openbijli/data`, `@openbijli/engine`, `@openbijli/evidence`), the web app, the CLIs and the
tariff data all move together. Releases are cut by
[release-please](https://github.com/googleapis/release-please) from
[Conventional Commits](https://www.conventionalcommits.org/) on `main`.

## Version numbers

We follow [Semantic Versioning 2.0](https://semver.org/). Tags are `vMAJOR.MINOR.PATCH`, for
example `v0.1.0`.

| Change | Commit type | Version bump before 1.0 | Version bump from 1.0 |
|---|---|---|---|
| New feature, new tariff book (new state or new financial year) | `feat` | minor | minor |
| Bug fix, corrected tariff value | `fix` | patch | patch |
| Performance improvement with identical results | `perf` | patch | patch |
| Breaking change to a package API, the CLI, the log format or the data schema | `feat!` / `fix!` or a `BREAKING CHANGE:` footer | minor | major |
| Docs, tests, refactors, CI, dependency updates, data maintenance that changes no value (`data`) | `docs`, `test`, `refactor`, `ci`, `chore`, `data` | none on its own | none on its own |

While the project is below 1.0, breaking changes bump the minor version
(`bump-minor-pre-major` in [`release-please-config.json`](../release-please-config.json)).

### How tariff data maps to versions

Tariff books are never edited in place for a new year: a new financial year is a new file
(see [tariff-update-workflow.md](tariff-update-workflow.md)), so a release always reproduces the
bills of every earlier release.

- A new book or a new financial year is a `feat(data): ...` commit and a minor release.
- A corrected rate, slab, charge or rule in an existing book is a `fix(data): ...` commit and a
  patch release, because bills computed with it change.
- Adding fingerprints, sources, quotes or gap notes without changing any value is
  `data: ...` and waits for the next release.

The financial year a book covers is part of the data itself (`financialYear`), so consumers
can always tell which tariff a version carries.

## How a release happens

1. Pull requests are squash-merged into `main` with a Conventional Commit title.
2. On every push to `main`, the **Release** workflow
   ([`.github/workflows/release.yml`](../.github/workflows/release.yml)) runs release-please,
   which opens or updates one pull request titled `chore: release X.Y.Z`. It contains:
   - the new version in every `package.json` and in `package-lock.json` (including the
     internal `@openbijli/*` dependency pins, so `npm ci` keeps working), and
   - the new section of [`CHANGELOG.md`](../CHANGELOG.md), grouped into Features, Bug fixes,
     Performance and Reverts.
3. A maintainer reviews that pull request (check the changelog wording) and merges it.
   Pull requests opened with the default `GITHUB_TOKEN` do not trigger CI. Either add the
   optional `RELEASE_PLEASE_TOKEN` secret (a fine-grained token for this repository with
   read/write access to contents and pull requests), or close and reopen the release pull
   request to run the checks before merging.
4. release-please then tags `vX.Y.Z` and publishes the GitHub Release with the changelog
   section as its notes.
5. In the same workflow run, the **assets** job checks out the tag, runs the data check, the
   tests and the build, and attaches to the release:
   - `openbijli-web-vX.Y.Z.zip`: the web app built with relative paths. Unzip it anywhere and
     open `index.html` through any static file server.
   - `openbijli-data-vX.Y.Z.zip`: the `data/` folder (tariff books, national parameters, solar
     resource, JSON Schemas), licensed CC BY 4.0.
   - `openbijli-data-X.Y.Z.tgz`, `openbijli-engine-X.Y.Z.tgz`, `openbijli-evidence-X.Y.Z.tgz`:
     the npm packages, installable with `npm install ./openbijli-engine-X.Y.Z.tgz`.
   - `SHA256SUMS.txt`, plus a signed
     [build provenance attestation](https://docs.github.com/actions/security-for-github-actions/using-artifact-attestations)
     for every file. Verify with `gh attestation verify <file> --repo byjoellobo/openbijli`.
6. If npm publishing is enabled (below), the **npm-publish** job publishes the three packages
   with provenance, in dependency order.

These jobs live in the same workflow as release-please because a release created with the
default `GITHUB_TOKEN` does not trigger other workflows.

## Rebuilding the assets of a release

Run the **Release** workflow by hand (Actions, Release, Run workflow) and enter an existing tag,
for example `v0.1.0`. The assets job rebuilds from that tag and replaces the files on its
release. The v0.1.0 tag and release were created by hand before the first release-please run,
and their assets were attached this way:

```bash
gh workflow run release.yml -f tag=v0.1.0
```

## Enabling npm publishing

Publishing is off until the packages exist on npm and trusted publishing is set up. No npm
token is stored in the repository.

1. On npmjs.com, create the `@openbijli` organisation (or scope) and, for each of
   `@openbijli/data`, `@openbijli/engine` and `@openbijli/evidence`, add a
   **trusted publisher**: GitHub Actions, repository `byjoellobo/openbijli`, workflow
   `release.yml`, environment `npm-release`. (npm needs each package to exist first: publish
   0.1.0 once by hand from the release `.tgz` files, or let the first automated release do it
   once trusted publishing is allowed for new packages in your account.)
2. In the repository settings, create the environment `npm-release` and add yourself as a
   required reviewer, so every publish waits for an approval.
3. Add the repository variable `NPM_PUBLISH` with the value `true`
   (Settings, Secrets and variables, Actions, Variables).
4. Protect release tags: add a tag ruleset for `v*` that only allows maintainers (and the
   release workflow) to create, update or delete them.

## Hotfixes

Fix forward on `main` with a `fix:` commit; release-please proposes the patch release straight
away. Merge its release pull request as soon as CI is green. We do not maintain release
branches before 1.0.

## Doing a release by hand (emergency only)

If release-please is unavailable, update every version listed in
[`release-please-config.json`](../release-please-config.json) (the `extra-files` paths) and
`.release-please-manifest.json`, add the CHANGELOG section, commit `chore: release X.Y.Z`, then:

```bash
git tag -a vX.Y.Z -m "OpenBijli vX.Y.Z"
git push origin main vX.Y.Z
gh release create vX.Y.Z --title "OpenBijli vX.Y.Z" --notes-file <notes.md> --verify-tag
gh workflow run release.yml -f tag=vX.Y.Z
```
