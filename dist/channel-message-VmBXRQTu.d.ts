import { li as deliverInboundReplyWithMessageSendContext } from "./types-DaHgOqFX.js";
import { n as CreateChannelReplyPipelineParams, t as ChannelReplyPipeline } from "./reply-pipeline-BtSRVpC9.js";
//#region src/plugin-sdk/channel-message.d.ts
/** @deprecated Use `createChannelMessageReplyPipeline(...)` from `openclaw/plugin-sdk/channel-outbound`. */
declare function createChannelTurnReplyPipeline(params: CreateChannelReplyPipelineParams): ChannelReplyPipeline;
/** @deprecated Use `deliverInboundReplyWithMessageSendContext(...)` from `openclaw/plugin-sdk/channel-outbound`. */
declare const deliverDurableInboundReplyPayload: typeof deliverInboundReplyWithMessageSendContext;
//#endregion
export { deliverDurableInboundReplyPayload as n, createChannelTurnReplyPipeline as t };