---
name: recon-playbook
description: Playbook for attack surface mapping and asset enumeration
---

# Reconnaissance Playbook

This playbook outlines a safe, standard procedure for enumerating a target's attack surface using Impactr's toolchain.

## 1. Initial Assessment
When beginning reconnaissance, always start by running standard non-intrusive discovery tools.

- Use the `bash` tool to run enumeration tools.

## 2. Record Discoveries
As soon as you discover a valid service, open port, or hidden directory, you **must** record it.
- Use the `record_discovery` tool to log the asset. Provide the IP/domain, subdoman, web directory, the port, and the service, or any exposed info such as server etc.

## 3. Queue Hypotheses
If you notice a service that is notoriously vulnerable (e.g., an outdated version of ProFTPD, or an exposed `.git` directory), do not exploit it immediately.
- Use the `queue_hypothesis` tool to queue a formal hypothesis for the `attack` agent to investigate later.
- Example: "Hypothesis: The exposed `.git` directory on port 80 allows for source code leakage."

## 4. Draft Vulnerabilities
If a hypothesis is confirmed, or if a severe vulnerability is found directly during recon (such as an open directory listing sensitive credentials):
- Use the `draft_vulnerability` tool to generate a report.
- Include a exact how to reproduce steps (So a non tech guy also can reproduce the issue), CVSS score estimation, the impact, and the remediation steps.

## Safety & Scope
- **DO NOT** attempt to exploit any vulnerabilities directly. Your job is only to map the surface and queue hypotheses for the orchestrator.
- **DO NOT** scan targets that have not been explicitly authorized in your current scope.
