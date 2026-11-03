## Summary

<!-- What does this change and why? Link the issue it closes (e.g. "Closes #12").
     For tariff data, open the PR with ?template=tariff-update.md instead. -->

## Type of change

- [ ] `feat`: new feature or tariff book
- [ ] `fix`: bug fix or corrected value
- [ ] `docs`: documentation only
- [ ] `refactor` / `perf` / `test`: no behaviour change
- [ ] `ci` / `build` / `chore`: tooling, workflows, dependencies
- [ ] Breaking change (API or data schema; add `!` to the title)

## Checklist

- [ ] The PR title follows [Conventional Commits](https://www.conventionalcommits.org/) (`type(scope): description`); it becomes the squash-merge commit and the changelog entry
- [ ] `npm run typecheck` and `npm test` pass
- [ ] `npm run test:e2e` passes (web app changes)
- [ ] Tests added or updated for behaviour changes, with hand-worked expected values for engine changes
- [ ] Docs updated (README, docs/, package READMEs) if behaviour or APIs changed
- [ ] No em dashes in code, docs or data text
- [ ] Hardware changes keep the rule: the device never opens, wires into or alters the meter
- [ ] No personal data (names, account numbers, addresses, meter serials) in fixtures or screenshots

## Screenshots

<!-- For UI changes: before and after, desktop and phone. -->
