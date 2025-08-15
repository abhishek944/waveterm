import * as mobx from "mobx";
import { Model } from "./model";

class SidebarChatModel {
    globalModel: Model;
    sidebarChatFocused: OV<boolean> = mobx.observable.box(false, { name: "SidebarChatModel-sidebarChatFocused" });
    cmdAndOutput: OV<{ cmd: string; output: string; usedRows: number; isError: boolean }> = mobx.observable.box(
        { cmd: "", output: "", usedRows: 0, isError: false },
        { name: "SidebarChatModel-cmdAndOutput" }
    );
    cmdFromChat: OV<string> = mobx.observable.box("", { name: "SidebarChatModel-cmdFromChat" });
    selectedCodeBlockIndex: OV<number> = mobx.observable.box(null, { name: "SidebarChatModel-codeBlockIndex" });
    
    // AI Chat state
    currentChatId: OV<string> = mobx.observable.box(null, { name: "SidebarChatModel-currentChatId" });
    chatHistory: OV<AIChatHistoryType | null> = mobx.observable.box(null, { name: "SidebarChatModel-chatHistory" });
    chatList: OArr<AIChatType> = mobx.observable.array([], { name: "SidebarChatModel-chatList" });
    isLoading: OV<boolean> = mobx.observable.box(false, { name: "SidebarChatModel-isLoading" });

    constructor(globalModel: Model) {
        this.globalModel = globalModel;
        mobx.makeObservable(this);
    }

    // block can be the chat-window in terms of focus
    @mobx.action
    setFocus(focus: boolean): void {
        this.resetFocus();
        this.sidebarChatFocused.set(focus);
    }

    hasFocus(): boolean {
        return this.sidebarChatFocused.get();
    }

    @mobx.action
    resetFocus(): void {
        this.sidebarChatFocused.set(false);
    }

    @mobx.action
    setCmdAndOutput(cmd: string, output: string, usedRows: number, isError: boolean): void {
        console.log("cmd", cmd);
        this.cmdAndOutput.set({
            cmd: cmd,
            output: output,
            usedRows: usedRows,
            isError: isError,
        });
    }

    getCmdAndOutput(): { cmd: string; output: string; usedRows: number; isError: boolean } {
        return this.cmdAndOutput.get();
    }

    @mobx.action
    resetCmdAndOutput(): void {
        this.cmdAndOutput.set({
            cmd: "",
            output: "",
            usedRows: 0,
            isError: false,
        });
    }

    hasCmdAndOutput(): boolean {
        const { cmd, output } = this.cmdAndOutput.get();
        return cmd.length > 0 || output.length > 0;
    }

    @mobx.action
    setCmdToExec(cmd: string): void {
        this.cmdFromChat.set(cmd);
    }

    @mobx.action
    resetCmdToExec(): void {
        this.cmdFromChat.set("");
    }

    getCmdToExec(): string {
        return this.cmdFromChat.get();
    }

    getSelectedCodeBlockIndex(): number {
        return this.selectedCodeBlockIndex.get();
    }

    setSelectedCodeBlockIndex(index: number): void {
        this.selectedCodeBlockIndex.set(index);
    }

    resetSelectedCodeBlockIndex(): void {
        this.selectedCodeBlockIndex.set(null);
    }

    // AI Chat methods
    @mobx.action
    setCurrentChatId(chatId: string): void {
        this.currentChatId.set(chatId);
    }

    @mobx.action
    setChatHistory(history: AIChatHistoryType): void {
        // Ensure messages array exists
        if (history && !history.messages) {
            history.messages = [];
        }
        this.chatHistory.set(history);
    }

    @mobx.action
    setChatList(chats: AIChatType[]): void {
        this.chatList.replace(chats);
    }

    @mobx.action
    setIsLoading(loading: boolean): void {
        this.isLoading.set(loading);
    }

    @mobx.action
    addMessageToHistory(message: AIMessageType): void {
        const currentHistory = this.chatHistory.get();
        
        // If no history exists at all, create a new one
        if (!currentHistory) {
            this.chatHistory.set({
                chatid: message.chatid,
                messages: [message]
            });
            return;
        }
        
        // If history exists but for a different chat, replace it
        if (currentHistory.chatid !== message.chatid) {
            this.chatHistory.set({
                chatid: message.chatid,
                messages: [message]
            });
            return;
        }
        
        // If history exists for the same chat, add the message
        // Create a new object to trigger MobX updates
        const newHistory: AIChatHistoryType = {
            chatid: currentHistory.chatid,
            messages: currentHistory.messages ? [...currentHistory.messages, message] : [message]
        };
        this.chatHistory.set(newHistory);
    }

    getCurrentChatId(): string {
        return this.currentChatId.get();
    }

    getChatHistory(): AIChatHistoryType | null {
        return this.chatHistory.get();
    }

    getChatList(): AIChatType[] {
        return this.chatList;
    }

    getIsLoading(): boolean {
        return this.isLoading.get();
    }
}

export { SidebarChatModel };
