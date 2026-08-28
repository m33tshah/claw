import { a as normalizeLowercaseStringOrEmpty } from "./string-coerce-DW4mBlAt.js";
import { n as normalizeAccountId } from "./account-id-C7N4Rwku.js";
import { g as sanitizeAgentId, i as buildAgentMainSessionKey } from "./session-key-VWT_xzM9.js";
import { r as logVerbose } from "./globals-0FRK183t.js";
import { i as resolveAgentRoute, n as deriveLastRoutePolicy, t as buildAgentSessionKey } from "./resolve-route-EO7BJcsf.js";
import "./runtime-env-DufDD2ec.js";
import "./string-coerce-runtime-ZbuYDJgZ.js";
import "./routing-D8zbLWGc.js";
import { n as resolveConfiguredBindingRoute, r as resolveRuntimeConversationBindingRoute } from "./binding-routing-CR51Xysx.js";
import "./conversation-runtime-Dg1MGKiZ.js";
import { a as resolveDefaultTelegramAccountId } from "./accounts-B2_AQ-Fk.js";
import { M as resolveTelegramDirectPeerId, x as buildTelegramParentPeer, y as buildTelegramGroupPeerId } from "./sent-message-cache-BGcQC26h.js";
//#region extensions/telegram/src/conversation-route.ts
function resolveTelegramConversationRoute(params) {
	const peerId = params.isGroup ? buildTelegramGroupPeerId(params.chatId, params.resolvedThreadId) : resolveTelegramDirectPeerId({
		chatId: params.chatId,
		senderId: params.senderId
	});
	const parentPeer = buildTelegramParentPeer({
		isGroup: params.isGroup,
		resolvedThreadId: params.resolvedThreadId,
		chatId: params.chatId
	});
	let route = resolveAgentRoute({
		cfg: params.cfg,
		channel: "telegram",
		accountId: params.accountId,
		peer: {
			kind: params.isGroup ? "group" : "direct",
			id: peerId
		},
		parentPeer
	});
	const rawTopicAgentId = params.topicAgentId?.trim();
	if (rawTopicAgentId) {
		const topicAgentId = sanitizeAgentId(rawTopicAgentId);
		const sessionKey = normalizeLowercaseStringOrEmpty(buildAgentSessionKey({
			agentId: topicAgentId,
			channel: "telegram",
			accountId: params.accountId,
			peer: {
				kind: params.isGroup ? "group" : "direct",
				id: peerId
			},
			dmScope: params.cfg.session?.dmScope,
			identityLinks: params.cfg.session?.identityLinks
		}));
		const mainSessionKey = normalizeLowercaseStringOrEmpty(buildAgentMainSessionKey({ agentId: topicAgentId }));
		route = {
			...route,
			agentId: topicAgentId,
			sessionKey,
			mainSessionKey,
			lastRoutePolicy: deriveLastRoutePolicy({
				sessionKey,
				mainSessionKey
			})
		};
		logVerbose(`telegram: topic route override: topic=${params.resolvedThreadId ?? params.replyThreadId} agent=${topicAgentId} sessionKey=${route.sessionKey}`);
	}
	const configuredRoute = resolveConfiguredBindingRoute({
		cfg: params.cfg,
		route,
		conversation: {
			channel: "telegram",
			accountId: params.accountId,
			conversationId: peerId,
			parentConversationId: params.isGroup ? String(params.chatId) : void 0
		}
	});
	route = configuredRoute.route;
	let bindingMode = configuredRoute.bindingResolution ? {
		kind: "configured",
		binding: configuredRoute.bindingResolution,
		sessionKey: configuredRoute.boundSessionKey ?? route.sessionKey
	} : { kind: "none" };
	const runtimeBindingConversationId = params.replyThreadId != null ? `${params.chatId}:topic:${params.replyThreadId}` : String(params.chatId);
	const runtimeRoute = resolveRuntimeConversationBindingRoute({
		route,
		conversation: {
			channel: "telegram",
			accountId: params.accountId,
			conversationId: runtimeBindingConversationId
		}
	});
	route = runtimeRoute.route;
	if (runtimeRoute.bindingRecord) {
		bindingMode = runtimeRoute.boundSessionKey ? {
			kind: "runtime-bound",
			sessionKey: runtimeRoute.boundSessionKey
		} : { kind: "plugin-owned-runtime" };
		logVerbose(runtimeRoute.boundSessionKey ? `telegram: routed via bound conversation ${runtimeBindingConversationId} -> ${runtimeRoute.boundSessionKey}` : `telegram: plugin-bound conversation ${runtimeBindingConversationId}`);
	}
	return {
		route,
		bindingMode
	};
}
function resolveTelegramConversationBaseSessionKey(params) {
	if (!(normalizeAccountId(params.route.accountId) !== normalizeAccountId(resolveDefaultTelegramAccountId(params.cfg)) && params.route.matchedBy === "default") || params.isGroup) return params.route.sessionKey;
	return normalizeLowercaseStringOrEmpty(buildAgentSessionKey({
		agentId: params.route.agentId,
		channel: "telegram",
		accountId: params.route.accountId,
		peer: {
			kind: "direct",
			id: resolveTelegramDirectPeerId({
				chatId: params.chatId,
				senderId: params.senderId
			})
		},
		dmScope: "per-account-channel-peer",
		identityLinks: params.cfg.session?.identityLinks
	}));
}
//#endregion
export { resolveTelegramConversationRoute as n, resolveTelegramConversationBaseSessionKey as t };
