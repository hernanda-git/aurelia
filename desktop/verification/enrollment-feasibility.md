# Agent enrollment feasibility — read-only assessment

Assessment date: October 26, 2026 (conversation date).

## Decision

**Tool integration is supported; trustworthy PES enrollment of this existing agent session is not demonstrated. Keep commit unavailable and ship assessment-only.** Runtime-injected context is useful correlation inside a trusted Hermes process; it is not an externally verifiable agent principal or a PES capability bootstrap. No live handshake was performed, and this report must not satisfy the plan's enrollment acceptance checkbox.

This conclusion is scoped to the inspected installation and interfaces, not a claim that Hermes cannot be extended to implement enrollment.

## Required gate

Read `C:/Workspace/pesautomation/.hermes/plans/2026-10-26_132306-agent-only-task-completion-master-plan.md`:

- Lines 31–36 reject actor/env/file labels and distinguish the ordinary application boundary from a fully compromised Windows account.
- Lines 117–127 require proof of supervisor-to-child enrollment; a current-user pipe ACL alone is not agent authentication. Capabilities must remain outside chat, renderer state and logs.
- Lines 262–268 require a read-only actual-supervisor handshake proof and explicitly block exposing commit when authenticity is unresolved.
- Lines 332–350 separately require demonstrated enrollment and identify the missing supervisor/bootstrap decision.

**Gate result: NOT MET.** Source inspection proves extension mechanisms, not enrollment of a live PES adapter.

## Inspected installation and scope

The command shell's `python` resolved to:

`C:/Users/it26/AppData/Local/hermes/installs/772547e7b2e43300/environments/53ff343c4af74ed1b82bb2ecc9575869/venv/Scripts/python.exe`

`importlib.util.find_spec('hermes_cli').origin` resolved the source root, called **R** below, to:

`C:/Users/it26/AppData/Local/hermes/installs/772547e7b2e43300/environments/53ff343c4af74ed1b82bb2ecc9575869/workspace`

`R/hermes_agent.egg-info/PKG-INFO` reports name `hermes-agent`, version `0.0.0`; this placeholder is not a usable release identifier. References below identify the exact inspected install path instead. Executable-only ancestry metadata was inspected; it is not proof of agent identity or that every live thread uses the same source tree.

Installed Hermes skill references read: `autonomous-ai-agents/hermes-agent/SKILL.md`, `references/contributor-guide.md`, and `references/native-mcp.md` beneath `C:/Users/it26/AppData/Local/hermes/skills/`. The resolved runtime source has no `docs/` or `website/` directory. Current official website pages were therefore also fetched directly; online documentation can differ from this installation.

Only default-profile plugin directory names were enumerated; no PES-specific plugin was observed there. This is not a configured-server inventory: configuration and credential files were deliberately not opened.

## Concrete findings from installed source

### 1. A native plugin can expose typed agent tools

- `R/hermes_cli/plugins.py:462–499`: `PluginContext.register_tool(name, toolset, schema, handler, ...)` registers and tracks a scoped handler.
- `R/tools/registry.py:946–963`: dispatch selects the handler, filters optional kwargs to its signature, and invokes it.
- `R/agent/tool_executor.py:1716–1735`: the regular agent executor supplies `session_id=agent.session_id`, task identity and turn/tool-call correlation to `model_tools.handle_function_call`.
- `R/model_tools.py:823–846`: ordinary registry handlers receive injected `task_id`, `session_id` and `user_task`; approval observability is bound around execution. These are separate from model-supplied tool arguments in the ordinary execution path.

**Interpretation:** Do not falsely say context is only model-provided text. The host does inject real execution context. But the callable dispatcher accepts optional identifiers (`R/model_tools.py:873–895`), the registry accepts arbitrary caller kwargs, and plugins may call `ctx.dispatch_tool` directly (`R/hermes_cli/plugins.py:684–693`). A nonempty identifier or a hook event alone does not establish exclusive agent origin. No inspected plugin API exports a signed per-run PES identity or establishes broker trust automatically.

Lifecycle hooks and `on_unload` exist (`R/hermes_cli/plugins.py:415–433,943–964`), but hooking startup/session events is not enrollment. Generic hook/request processing also has fail-open paths (`R/model_tools.py:753–763,774–786`); mutation authorization must be a fail-closed check in the privileged boundary, not just a hook.

### 2. Native stdio MCP is a real tool transport, not a per-agent attestation channel

- `R/tools/mcp_tool_transport.py:126–150,365–385,414–420`: Hermes resolves a configured command/environment/cwd and opens an MCP stdio child through `StdioServerParameters` and `stdio_client`.
- `R/tools/mcp_tool_registration.py:294–299,384–393`: discovered MCP tool schemas become registry tools.
- `R/tools/mcp_tool_handlers.py:619–674`: the generated handler accepts `**kwargs`, but its outgoing call passes the tool arguments, not injected session/task identity. At lines 432–449 the request is `session.call_tool(tool_name, arguments=args, ...)`; the optional extra is a progress callback, not identity proof.

**Interpretation:** A Node stdio MCP server is the smallest supported transport for a future external PES assessment adapter. Do not implement arbitrary line-delimited JSON and call it MCP: use a compatible MCP server implementation and typed schemas. A tool argument named `agentRunId` remains client input. A private stdio connection authenticates possession of that connection to its endpoints, but simply launching an adapter under Hermes does not establish why PES should trust that particular child or bind its shared server connection to a particular conversation/run.

### 3. Other identity-looking features do not fill this gap

- `R/tools/mcp_tool_errors.py:245–283`: HTTP `identity_header` is a configured static value or active profile name, resolved at connection time; explicitly configured headers take precedence. It is not per-call attestation. Stdio ignores it (`mcp_tool_transport.py:367–369`).
- `R/tools/mcp_tool_transport.py:95–123`: application declarations can discover an HTTP endpoint and bearer from application liveness data. This is endpoint/client credential transport, not proof that a call came from an enrolled agent run. It is unsuitable as a file-based mutation bootstrap under this plan.
- `R/tools/managed_gateway_identity.py:1–5,39–45,87–105`: first-party gateway headers carry telemetry/correlation identifiers, including an environment fallback. They are not reusable PES authorization claims.
- `R/hermes_cli/plugin_host.py:90–142` and `plugin_host_wire.py:1–14`: private plugin-host IPC propagates caller context over parent-created pipes. This provides a real internal transport, but there is no demonstrated supported handoff of that parent's trust to the independent PES broker. It must not be reverse-engineered into an incidental enrollment bypass.
- `R/hermes_cli/plugin_host_http_auth.py:1–22`: dashboard route admission carries a human/API-token authentication decision, not agent-only tool origin.
- `R/hermes_cli/gateway_runtime_service_identity.py:1–5,49–55,92–147`: service launch/profile binding checks are not agent-run capabilities.
- `R/hermes_cli/gateway_enroll.py:1–5`: `hermes gateway enroll` concerns a self-hosted messaging relay connector. Its similarly named enrollment is not a local tool-adapter/PES enrollment API.

## Official documentation checked

Fetched the official `https://hermes-agent.nousresearch.com/docs/llms.txt` index and these pages in full before selecting relevant excerpts:

- **Build a Hermes Plugin:** `https://hermes-agent.nousresearch.com/docs/developer-guide/plugins` — documents `ctx.register_tool`, context keyword injection, lifecycle hooks, and `ctx.dispatch_tool` even from slash-command handlers. This supports extensibility, not exclusive model-origin dispatch.
- **Observer Hooks:** `https://hermes-agent.nousresearch.com/docs/developer-guide/observer-hooks` — describes IDs as correlation fields and distinguishes turn/run end from final session teardown. Do not treat `on_session_end` as final conversation revocation by itself.
- **MCP Config Reference:** `https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference` — documents stdio command/args/env, HTTP authentication, tool filters, trust/approval policy and replay behavior. MCP authorization grants access to a server; it does not supply the missing local PES principal. Human approval mode is not the requested agent-only enrollment.
- **Programmatic Integration:** `https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration` — ACP and TUI gateway have stdio protocols; the API server uses HTTP/SSE. These are supported ways to host/drive Hermes, not an already configured PES supervisor/capability issuance flow.
- **Hermes Relay:** `https://hermes-agent.nousresearch.com/docs/user-guide/messaging/relay` — actual relay enrollment authenticates gateways to messaging connectors using connector-issued enrollment material. It neither enrolls local PES tools nor establishes task/proposal-scoped mutation authority.

No applicable ready-made PES/local-adapter enrollment contract was found in these pages or the inspected source paths. This is bounded negative evidence, not a whole-repository formal proof.

## Smallest honest implementation recommendation

### Ship now: assessment-only

1. Keep all completion mutation entry points unregistered/unavailable, not merely hidden in the UI. No `pes_commit_completion`, enrollment-token endpoint, CLI complete command, generic browser/script executor or renderer mutation IPC.
2. Implement pure assessment against existing sanitized snapshot/provenance inputs, with explicit stale/unverified-source flags and `AGENT_ENROLLMENT_UNVERIFIED`. Return eligibility analysis and hypothetical diffs, never a claim of authorization to submit. Authenticated-agent fields must be absent or explicitly unverified, not copied from env/input.
3. If a tool adapter is built in project source, make it a **read-only stdio MCP server** exposing assessment/query tools only. No new Hermes config/plugin installation is authorized by this inspection; describe it as built but not connected until a separate authorized installation and actual read-only invocation are verified.
4. Keep Sync read-only. Do not let sync, login, startup, imported files, a timer, or hypothetical proposals dispatch Update/Upload. Prefer offline snapshot assessment for the first slice; live candidate discovery needs the ordinary main-process read boundary and independent verification.
5. Make live readiness fail closed independent of caller labels. Tests should cover renderer/shell/env/file-spoof attempts, no discovered commit tool, and zero portal mutation calls even for otherwise eligible proposals. Test fixtures or fabricated principals must be labeled as such and cannot clear the enrollment gate.

### Later: explicit trusted-supervisor work, not a claimed existing feature

The installed APIs demonstrate that a custom trusted host can drive Hermes and register/transport tools. They do **not** demonstrate this session is enrolled with PES. A future separately authorized supervisor must be the root of trust: own the run lifecycle, create the exact adapter/channel, and make the broker trust only that created channel using non-exported, short-lived bootstrap material delivered out of band (for example a deliberately designed inherited private handle or supervisor-owned IPC). No self-enrollment from a session string, same-user PID, argv/env value, clientInfo name, task file, shared static config bearer, or client-minted key.

After authenticating the adapter, bind a server-issued run principal to actual invocation lifecycle and scope capabilities to task/proposal/evidence/policy/operation/expiry/nonce, consume them durably, revoke on channel loss and handle reconnect as new enrollment. A long-lived MCP connection alone does not provide conversation isolation. Validate the exact Windows launch/handle lifecycle and expose a non-mutating challenge/query first; prove unauthorized shell clients cannot enroll. Only then revisit commit exposure and the master plan's independent/live-enable gates. This is new integration work; no stock Hermes enrollment command or private Vault/browser API is asserted to implement it.

## Limitations and side effects

No auth.json, .env, token stores, cookie stores, credential values, process command lines, other profiles, PES runtime data or live portal state were read. No Hermes configuration/plugins, PES source or credentials were changed; no services, MCP servers, approval UIs or live PES mutations were invoked. The sole intentional file write is this report. No citation ledger was created because the user's write scope permits only this report.

The generic web extractor could not fetch content with its search-only backend; direct HTTPS retrieval succeeded. A BeautifulSoup extraction attempt failed because that optional package was absent; standard-library HTML processing succeeded without installing anything. `command -v hermes` returned a launcher-looking path which was not openable at that exact native path; installation findings use the successfully resolved interpreter/module paths, not that launcher. No execution test of a PES adapter, trusted handshake, capability issuance, enrollment rejection or actual tool availability was performed. Those remain blockers, not inferred successes.
