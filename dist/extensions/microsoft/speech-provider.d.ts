import { Jn as SpeechProviderPlugin, nu as SpeechVoiceOption } from "../../types-DaHgOqFX.js";
//#region extensions/microsoft/speech-provider.d.ts
declare function isCjkDominant(text: string): boolean;
declare function listMicrosoftVoices(): Promise<SpeechVoiceOption[]>;
declare function buildMicrosoftSpeechProvider(): SpeechProviderPlugin;
//#endregion
export { buildMicrosoftSpeechProvider, isCjkDominant, listMicrosoftVoices };