// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useRef, useState, useCallback } from "react";
import { observer } from "mobx-react";
import { action } from "mobx";
import { GlobalModel, GlobalCommandRunner } from "@/models";
import { Markdown } from "@/components/ui/markdown";
import { TypingIndicator } from "@/components/ui/typingindicator";
import type { OverlayScrollbars } from "overlayscrollbars";
import { OverlayScrollbarsComponent, OverlayScrollbarsComponentRef } from "overlayscrollbars-react";
import { cn } from "@/lib/utils";
import { User, Bot, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatMessageProps {
    message: AIMessageType;
    onSetCmdInputValue?: (cmd: string) => void;
}

const ChatMessage: React.FC<ChatMessageProps> = observer(({ message, onSetCmdInputValue }) => {
    const isUser = message.role === "user";
    
    return (
        <div className={cn(
            "flex p-4",
            isUser ? "justify-start" : "justify-end"  // User messages left, AI messages right
        )}>
            <div className={cn(
                "flex gap-3 max-w-[80%] min-w-0",
                isUser ? "flex-row" : "flex-row-reverse"  // Icon position based on role
            )}>
                <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-white/10"
                )}>
                    {isUser ? (
                        <User className="w-4 h-4 text-white" />
                    ) : (
                        <Bot className="w-4 h-4 text-white" />
                    )}
                </div>
                <div className={cn(
                    "rounded-2xl px-4 py-2 overflow-hidden max-w-full bg-white/10"
                )}>
                    <div className="text-sm text-gray-100 break-words overflow-wrap-anywhere [&_pre]:max-w-full [&_pre]:overflow-x-auto">
                        <Markdown 
                            text={message.content} 
                            onClickExecute={onSetCmdInputValue}
                            showCopyButton={true}
                            showExecuteButton={false}
                            uiTheme="aichat"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
});

interface ChatWindowProps {
    messages: AIMessageType[];
    isLoading: boolean;
    chatWindowRef: React.RefObject<HTMLDivElement>;
    onRendered: (osInstance: OverlayScrollbars) => void;
    onSetCmdInputValue: (cmd: string) => void;
}

const ChatWindow: React.FC<ChatWindowProps> = observer(({ messages, isLoading, chatWindowRef, onRendered, onSetCmdInputValue }) => {
    const containerRef = useRef<OverlayScrollbarsComponentRef>(null);
    const osInstanceRef = useRef<OverlayScrollbars | null>(null);

    useEffect(() => {
        if (containerRef.current && osInstanceRef.current) {
            const { viewport } = osInstanceRef.current.elements();
            viewport.scrollTo({
                behavior: "smooth",
                top: chatWindowRef.current?.scrollHeight || 0,
            });
        }
    }, [messages.length, chatWindowRef]);

    const handleScrollbarInitialized = useCallback((instance: OverlayScrollbars) => {
        osInstanceRef.current = instance;
        const { viewport } = instance.elements();
        viewport.scrollTo({
            behavior: "auto",
            top: chatWindowRef.current?.scrollHeight || 0,
        });
        onRendered(instance);
    }, [onRendered, chatWindowRef]);

    return (
        <OverlayScrollbarsComponent
            ref={containerRef}
            className="flex-1 overflow-auto"
            options={{ 
                scrollbars: { 
                    autoHide: "scroll",
                    theme: "os-theme-dark"
                } 
            }}
            events={{ initialized: handleScrollbarInitialized }}
        >
            <div ref={chatWindowRef} className="flex flex-col min-h-full">
                <div className="flex-1" />
                {messages.map((msg) => (
                    <ChatMessage
                        key={msg.messageid}
                        message={msg}
                        onSetCmdInputValue={onSetCmdInputValue}
                    />
                ))}
                {isLoading && (
                    <div className="flex justify-end p-4">
                        <div className="flex gap-3 max-w-[80%] flex-row-reverse">
                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                                <Bot className="w-4 h-4 text-white" />
                            </div>
                            <div className="rounded-2xl px-4 py-2 bg-white/10">
                                <TypingIndicator />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </OverlayScrollbarsComponent>
    );
});

const ChatSidebar: React.FC = observer(() => {
    const sidebarRef = useRef<HTMLDivElement>(null);
    const chatWindowRef = useRef<HTMLDivElement>(null);
    
    const sidebarchatModel = GlobalModel.sidebarchatModel;
    const chatHistory = sidebarchatModel.getChatHistory();
    const isLoading = sidebarchatModel.getIsLoading();

    useEffect(() => {
        // Load initial chat on mount
        loadInitialChat();

        // Register keybindings
        const keybindManager = GlobalModel.keybindManager;
        
        keybindManager.registerKeybinding("pane", "aichat", "aichat:clearHistory", () => {
            handleNewChat();
            return true;
        });

        return () => {
            GlobalModel.keybindManager.unregisterDomain("aichat");
            GlobalModel.sidebarchatModel.resetFocus();
        };
    }, []);

    const loadInitialChat = async () => {
        try {
            console.log("Loading initial chat...");
            const result = await GlobalCommandRunner.aiChatGet();
            if (!result.success) {
                console.error("Failed to load chat:", result.error);
            } else {
                console.log("Initial chat loaded successfully");
                // If there's no chat history yet, initialize it
                const history = GlobalModel.sidebarchatModel.getChatHistory();
                const chatId = GlobalModel.sidebarchatModel.getCurrentChatId();
                console.log("After load - Chat ID:", chatId, "History:", history);
            }
        } catch (error) {
            console.error("Failed to load initial chat:", error);
        }
    };

    const handleNewChat = async () => {
        try {
            // Clear the current chat history immediately for better UX
            GlobalModel.sidebarchatModel.setChatHistory(null);
            
            const result = await GlobalCommandRunner.aiChatNew();
            if (result.success) {
                // The update will be handled by the model update handler
                // But we also need to ensure we get the new empty chat
                // Load the new chat to get its empty history
                setTimeout(async () => {
                    const chatId = GlobalModel.sidebarchatModel.getCurrentChatId();
                    if (chatId) {
                        await GlobalCommandRunner.aiChatGet(chatId);
                    }
                }, 100);
            }
        } catch (error) {
            console.error("Failed to create new chat:", error);
        }
    };

    const handleChatWindowRendered = useCallback((_instance: OverlayScrollbars) => {
        // We don't need to store the instance for now
    }, []);

    const handleSetCmdInputValue = action((cmd: string) => {
        GlobalModel.sidebarchatModel.setCmdToExec(cmd);
        GlobalModel.sidebarchatModel.resetFocus();
        GlobalModel.inputModel.curLine = cmd;
        GlobalModel.inputModel.giveFocus();
    });

    const messages = chatHistory?.messages ?? [];

    return (
        <div ref={sidebarRef} className="h-full flex flex-col text-foreground relative overflow-hidden">
            <div className="absolute inset-0 w-full h-full -z-10" />
            <div className="relative z-10 flex flex-col flex-1 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
                    <h2 className="text-sm font-medium text-gray-200">AI Chat</h2>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleNewChat}
                        className="h-7 w-7 rounded-full hover:bg-white/10"
                        title="New Chat"
                    >
                        <Plus className="w-4 h-4" />
                    </Button>
                </div>
                <ChatWindow
                    messages={messages}
                    isLoading={isLoading}
                    chatWindowRef={chatWindowRef}
                    onRendered={handleChatWindowRendered}
                    onSetCmdInputValue={handleSetCmdInputValue}
                />
            </div>
        </div>
    );
});

export { ChatSidebar };