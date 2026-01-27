/**
 * Plugin runtime agent namespace - enables plugins to trigger agent runs.
 *
 * Key use case: forking conversation context to a specialized agent run
 * (e.g., memory processing at agent_end hook) while preserving cache hits.
 */

import { randomUUID } from "node:crypto";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { agentCommand } from "../../commands/agent.js";
import { createDefaultDeps } from "../../cli/deps.js";
import { defaultRuntime } from "../../runtime.js";

export type PluginAgentRunParams = {
  /**
   * The prompt to send to the agent.
   */
  prompt: string;

  /**
   * Pre-seed the agent session with these messages instead of loading from session file.
   * Used for forking conversation context to a new isolated agent run.
   * Same messages array → same API prefix → cache hits on shared prefix.
   */
  initialMessages?: AgentMessage[];

  /**
   * Session key for the agent run. Determines which session transcript to use.
   * If not provided, uses the agent's main session.
   */
  sessionKey?: string;

  /**
   * Model to use for this run (e.g., "anthropic/claude-sonnet-4-20250514").
   * Defaults to the configured default model.
   */
  model?: string;

  /**
   * Thinking level for this run ("off", "low", "medium", "high", "xhigh").
   */
  thinking?: string;

  /**
   * Whether to deliver the response via configured delivery channel.
   */
  deliver?: boolean;

  /**
   * Queue lane for rate limiting.
   */
  lane?: string;

  /**
   * Timeout in milliseconds. Defaults to agent timeout config.
   */
  timeoutMs?: number;

  /**
   * Agent ID to run. Defaults to the primary agent.
   */
  agentId?: string;
};

export type PluginAgentRunUsage = {
  /**
   * Input tokens used.
   */
  input?: number;

  /**
   * Output tokens generated.
   */
  output?: number;

  /**
   * Tokens read from cache.
   */
  cacheRead?: number;

  /**
   * Tokens written to cache.
   */
  cacheWrite?: number;

  /**
   * Total tokens (input + output).
   */
  totalTokens?: number;
};

export type PluginAgentRunResult = {
  /**
   * Whether the run completed successfully.
   */
  ok: boolean;

  /**
   * Run ID for tracking.
   */
  runId: string;

  /**
   * Error message if the run failed.
   */
  error?: string;

  /**
   * Agent response text(s).
   */
  responseTexts?: string[];

  /**
   * Token usage stats for this run.
   */
  usage?: PluginAgentRunUsage;
};

/**
 * Trigger an agent run from within a plugin.
 *
 * This enables plugins (like agent_end hooks) to fork conversation context
 * to a new isolated agent run while preserving cache hits on the shared
 * message prefix.
 *
 * Example use case: Memory processing agent that receives the full conversation
 * context at agent_end and performs memory extraction/updates.
 */
export async function runPluginAgentTurn(
  params: PluginAgentRunParams,
): Promise<PluginAgentRunResult> {
  const runId = randomUUID();

  try {
    const result = await agentCommand(
      {
        message: params.prompt,
        sessionKey: params.sessionKey,
        thinking: params.thinking,
        deliver: params.deliver,
        lane: params.lane ?? "plugin",
        timeout: params.timeoutMs ? String(Math.ceil(params.timeoutMs / 1000)) : undefined,
        agentId: params.agentId,
        initialMessages: params.initialMessages,
        runId,
      },
      defaultRuntime,
      createDefaultDeps(),
    );

    const responseTexts = result?.payloads
      ?.filter((p) => typeof p.text === "string" && p.text.length > 0)
      .map((p) => p.text) as string[] | undefined;

    // Extract usage stats from agent meta
    const agentUsage = result?.meta?.agentMeta?.usage;
    const usage: PluginAgentRunUsage | undefined = agentUsage
      ? {
          input: agentUsage.input,
          output: agentUsage.output,
          cacheRead: agentUsage.cacheRead,
          cacheWrite: agentUsage.cacheWrite,
          totalTokens: agentUsage.total,
        }
      : undefined;

    return {
      ok: true,
      runId,
      responseTexts,
      usage,
    };
  } catch (err) {
    return {
      ok: false,
      runId,
      error: String(err),
    };
  }
}
