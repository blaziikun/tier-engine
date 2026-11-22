# Security policy

## Reporting a problem

Please report security problems privately: on this repository, **Security → Report a vulnerability**. Don't open a
public issue for them.

Reports are read and answered as soon as possible. Fixes are released as a new version, the sites built on it move to
it and deploy, and the advisory is published once they have.

## Scope

- **In scope:** the code in this repository, and how it behaves in the sites built on it, such as
  [tierinator.com](https://tierinator.com). A problem in an app's own files (its headers, pages or build)
  belongs on that app's repository.
- **Out of scope:** the third-party sites the apps fetch from (report those to them), and anything that needs an
  already compromised browser or device.

## What protects the sites

They have no server, accounts or database, so most of the usual web-app attacks have nothing to aim at. What's left
(hostile files and links, injected markup, the build and deploy pipeline) is covered in
[docs/security.md](docs/security.md), item by item.
