# Decision: Tailscale for CI/CD + Infrastructure Reliability

**Date:** 2026-02-25
**Status:** Accepted
**Decider:** Lee (with Claude as advisor)

## Context

EC2 public IP SSH has failed three times across the project's lifetime, each incident consuming 1-3 hours of troubleshooting. The pattern: instance shows "running," TCP connects but sshd banner never arrives, security groups are fine, console log shows clean boot. Root cause is never definitively identified. Each time, a stop/start cycle eventually fixes it — but also changes the public IP (no Elastic IP assigned), requiring updates across deploy scripts and CI/CD.

During the third incident (2026-02-25), Tailscale connected instantly while public SSH remained dead. This proved the instance was healthy and the problem was exclusively in the public IP SSH path.

## Decision

1. **All SSH goes through Tailscale.** CI/CD uses `tailscale/github-action` with an ephemeral OAuth key. Manual scripts default to Tailscale IP. Public IP SSH becomes irrelevant.
2. **Elastic IP allocated** to prevent IP churn for any non-SSH services (webhooks, future endpoints).
3. **AMI snapshot after each infra change** for 5-minute disaster recovery.
4. **Provision script** documents everything on the instance for when the AMI gets stale.

## Consequences

- CI/CD no longer fails when AWS public networking is flaky
- Stop/start cycles no longer require IP updates across the codebase
- Instance recovery from total loss: launch from AMI + attach Elastic IP + git pull = ~5 minutes
- New dependency: Tailscale OAuth client + GitHub secrets (one-time setup, Lee's fingers required)
- New dependency: Tailscale must be running on EC2 instance (already is, already survives reboots)

## Spec

`specs/INFRA-RELIABILITY.md`
