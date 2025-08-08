// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useRef, useState, useCallback } from "react";
import { observer } from "mobx-react";
import { action } from "mobx";
import { GlobalModel } from "@/models";
import { Markdown, TypingIndicator } from "@/elements";
import type { OverlayScrollbars } from "overlayscrollbars";
import { OverlayScrollbarsComponent, OverlayScrollbarsComponentRef } from "overlayscrollbars-react";
import { cn } from "../../lib/utils";
import { User, Sparkles, Send, Bot } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../../components/ui/select";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Button } from "../../components/ui/button";

// AI Provider Options
const aiProviders = [
  { id: 'openai', name: 'OpenAI', icon: '🤖' },
  { id: 'azure-openai', name: 'Azure OpenAI', icon: '☁️' },
  { id: 'gemini', name: 'Gemini', icon: '✨' },
];

interface ChatItemProps {
    chatItem: OpenAICmdInfoChatMessageType;
    itemCount: number;
    onSetCmdInputValue: (cmd: string) => void;
}

const ChatItem: React.FC<ChatItemProps> = observer(({ chatItem, itemCount, onSetCmdInputValue }) => {
    const { isassistantresponse, assistantresponse, userquery } = chatItem;
    
    const renderError = (err: string) => (
        <div className="flex items-start gap-4 p-6">
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5 text-red-500" />
            </div>
            <div className="flex-1">
                <p className="text-sm font-medium text-red-400 mb-1">Error</p>
                <p className="text-sm text-gray-300">{err}</p>
            </div>
        </div>
    );

    const renderContent = () => {
        if (!isassistantresponse) {
            return (
                <div className="flex items-start gap-4 p-6">
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-medium text-gray-200 mb-2">You</p>
                        <div className="text-[15px] text-gray-100 leading-relaxed">
                            <Markdown text={userquery} />
                        </div>
                    </div>
                </div>
            );
        }

        if (assistantresponse?.error) {
            return renderError(assistantresponse.error);
        }

        if (!assistantresponse?.message) {
            return (
                <div className="flex items-start gap-4 p-6">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-medium text-gray-200 mb-2">Assistant</p>
                        <TypingIndicator className="mt-2" />
                    </div>
                </div>
            );
        }

        return (
            <div className="flex items-start gap-4 p-6">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                    <p className="text-sm font-medium text-gray-200 mb-2">Assistant</p>
                    <div className="text-[15px] text-gray-100 leading-relaxed prose prose-sm prose-invert max-w-none">
                        <Markdown text={assistantresponse.message} onClickExecute={onSetCmdInputValue} />
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className={cn(
            "group hover:bg-white/[0.02] transition-colors duration-200",
            itemCount % 2 === 0 ? "bg-transparent" : "bg-white/[0.01]"
        )}>
            {renderContent()}
        </div>
    );
});

interface ChatWindowProps {
    chatWindowRef: React.RefObject<HTMLDivElement>;
    onRendered: (osInstance: OverlayScrollbars) => void;
    onSetCmdInputValue: (cmd: string) => void;
}

const ChatWindow: React.FC<ChatWindowProps> = observer(({ chatWindowRef, onRendered, onSetCmdInputValue }) => {
    const containerRef = useRef<OverlayScrollbarsComponentRef>(null);
    const osInstanceRef = useRef<OverlayScrollbars | null>(null);
    const chatMessageItems = GlobalModel.inputModel.AICmdInfoChatItems.slice();

    useEffect(() => {
        if (containerRef.current && osInstanceRef.current) {
            const { viewport } = osInstanceRef.current.elements();
            viewport.scrollTo({
                behavior: "smooth",
                top: chatWindowRef.current?.scrollHeight || 0,
            });
        }
    }, [chatMessageItems.length, chatWindowRef]);

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
                {chatMessageItems.map((chatItem, idx) => (
                    <ChatItem
                        key={idx}
                        chatItem={chatItem}
                        itemCount={idx + 1}
                        onSetCmdInputValue={onSetCmdInputValue}
                    />
                ))}
            </div>
        </OverlayScrollbarsComponent>
    );
});

const ChatSidebar: React.FC = observer(() => {
    const sidebarRef = useRef<HTMLDivElement>(null);
    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    const chatWindowRef = useRef<HTMLDivElement>(null);
    const [value, setValue] = useState("");
    const [osInstance, setOsInstance] = useState<OverlayScrollbars | null>(null);
    const [selectedProvider, setSelectedProvider] = useState('openai');
    const termFontSize = 14;

    useEffect(() => {
        const hasCmdAndOutput = GlobalModel.sidebarchatModel.hasCmdAndOutput();
        const selectedCodeBlockIndex = GlobalModel.sidebarchatModel.getSelectedCodeBlockIndex();

        if (hasCmdAndOutput) {
            const newCmdAndOutput = GlobalModel.sidebarchatModel.getCmdAndOutput();
            const newValue = formChatMessage(newCmdAndOutput);
            setValue(newValue);
            GlobalModel.sidebarchatModel.resetCmdAndOutput();
        }

        if (selectedCodeBlockIndex == null) {
            updatePreTagOutline();
        }
    }, [GlobalModel.sidebarchatModel.hasCmdAndOutput(), GlobalModel.sidebarchatModel.getSelectedCodeBlockIndex()]);

    useEffect(() => {
        const handleClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (
                target.closest(".copy-button") ||
                target.closest(".execute-button") ||
                target.closest(".chat-textarea")
            ) {
                return;
            }

            const pre = target.closest("pre");
            if (pre) {
                const pres = chatWindowRef.current?.querySelectorAll("pre");
                if (pres) {
                    pres.forEach((preElement, idx) => {
                        if (preElement === pre) {
                            GlobalModel.sidebarchatModel.setSelectedCodeBlockIndex(idx);
                            updatePreTagOutline(pre);
                        }
                    });
                }
            }
            GlobalModel.inputModel.setChatSidebarFocus();
        };

        if (sidebarRef.current) {
            sidebarRef.current.addEventListener("click", handleClick);
        }

        requestChatUpdate();

        // Register keybindings
        const keybindManager = GlobalModel.keybindManager;
        const inputModel = GlobalModel.inputModel;

        keybindManager.registerKeybinding("pane", "aichat", "generic:confirm", () => {
            handleEnterKeyPressed();
            return true;
        });

        keybindManager.registerKeybinding("pane", "aichat", "generic:expandTextInput", () => {
            handleExpandInputPressed();
            return true;
        });

        keybindManager.registerKeybinding("pane", "aichat", "aichat:clearHistory", () => {
            inputModel.clearAIAssistantChat();
            return true;
        });

        keybindManager.registerKeybinding("pane", "aichat", "generic:selectAbove", () => {
            return handleArrowUpPressed();
        });

        keybindManager.registerKeybinding("pane", "aichat", "generic:selectBelow", () => {
            return handleArrowDownPressed();
        });

        return () => {
            if (sidebarRef.current) {
                sidebarRef.current.removeEventListener("click", handleClick);
            }
            GlobalModel.keybindManager.unregisterDomain("aichat");
            GlobalModel.sidebarchatModel.resetFocus();
        };
    }, []);

    useEffect(() => {
        adjustTextAreaHeight();
    }, [value]);

    const requestChatUpdate = () => {
        const chatMessageItems = GlobalModel.inputModel.AICmdInfoChatItems.slice();
        if (!chatMessageItems || chatMessageItems.length === 0) {
            submitChatMessage("");
        }
    };

    const adjustTextAreaHeight = () => {
        if (!textAreaRef.current) return;
        
        textAreaRef.current.style.height = "auto";
        const newHeight = Math.min(textAreaRef.current.scrollHeight, 200);
        textAreaRef.current.style.height = `${newHeight}px`;
    };

    const submitChatMessage = (messageStr: string) => {
        GlobalModel.sidebarchatModel.resetCmdAndOutput();
        const curLine = GlobalModel.inputModel.curLine;
        const prtn = GlobalModel.submitChatInfoCommand(messageStr, curLine, false);
        prtn.then((rtn) => {
            if (!rtn.success) {
                console.log("submit chat command error: " + rtn.error);
            }
        }).catch(() => {});
    };

    const handleTextAreaChange = action((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setValue(e.target.value);
    });

    const handleTextAreaFocus = action(() => {
        GlobalModel.inputModel.setChatSidebarFocus();
    });

    const handleTextAreaMouseDown = action(() => {
        updatePreTagOutline();
        GlobalModel.sidebarchatModel.resetSelectedCodeBlockIndex();
    });

    const handleEnterKeyPressed = action(() => {
        const blockIndex = GlobalModel.sidebarchatModel.getSelectedCodeBlockIndex();
        if (blockIndex != null) {
            handleSetCmdInputValue();
            return true;
        }
        if (value.trim()) {
            submitChatMessage(value);
            setValue("");
            GlobalModel.sidebarchatModel.resetCmdAndOutput();
        }
        return true;
    });

    const handleExpandInputPressed = action(() => {
        const currentRef = textAreaRef.current;
        if (!currentRef) return;
        currentRef.setRangeText("\n", currentRef.selectionStart, currentRef.selectionEnd, "end");
        setValue(currentRef.value);
    });

    const handleBlur = action(() => {
        GlobalModel.sidebarchatModel.resetFocus();
    });

    const updatePreTagOutline = (clickedPre?: Element) => {
        const pres = chatWindowRef.current?.querySelectorAll("pre");
        if (!pres) return;

        pres.forEach((preElement, idx) => {
            if (preElement === clickedPre) {
                GlobalModel.sidebarchatModel.setSelectedCodeBlockIndex(idx);
                preElement.classList.add("ring-2", "ring-indigo-500/30", "rounded-md", "bg-white/5");
            } else {
                preElement.classList.remove("ring-2", "ring-indigo-500/30", "bg-white/5");
            }
        });
    };

    const updateScrollTop = () => {
        const pres = chatWindowRef.current?.querySelectorAll("pre");
        if (!pres || !osInstance) return;

        const block = pres[GlobalModel.sidebarchatModel.getSelectedCodeBlockIndex()];
        if (!block) return;

        const { viewport, scrollOffsetElement } = osInstance.elements();
        const chatWindowTop = scrollOffsetElement.scrollTop;
        const chatWindowHeight = chatWindowRef.current?.clientHeight || 0;
        const chatWindowBottom = chatWindowTop + chatWindowHeight;
        const elemTop = (block as HTMLElement).offsetTop;
        const elemBottom = elemTop + (block as HTMLElement).offsetHeight;
        const elementIsInView = elemBottom <= chatWindowBottom && elemTop >= chatWindowTop;

        if (!elementIsInView) {
            let scrollPosition: number;
            if (elemBottom > chatWindowBottom) {
                scrollPosition = elemTop - chatWindowHeight + (block as HTMLElement).offsetHeight + 15;
            } else if (elemTop < chatWindowTop) {
                scrollPosition = elemTop - 15;
            } else {
                return;
            }
            viewport.scrollTo({
                behavior: "smooth",
                top: scrollPosition,
            });
        }
    };

    const handleChatWindowRendered = action((instance: OverlayScrollbars) => {
        setOsInstance(instance);
    });

    const handleArrowUpPressed = action(() => {
        if (handleTextAreaKeyDown("ArrowUp")) {
            const pres = chatWindowRef.current?.querySelectorAll("pre");
            let blockIndex = GlobalModel.sidebarchatModel.getSelectedCodeBlockIndex();
            if (!pres) return false;

            if (blockIndex == null) {
                GlobalModel.sidebarchatModel.setSelectedCodeBlockIndex(pres.length - 1);
            } else if (blockIndex > 0) {
                blockIndex--;
                GlobalModel.sidebarchatModel.setSelectedCodeBlockIndex(blockIndex);
            }
            blockIndex = GlobalModel.sidebarchatModel.getSelectedCodeBlockIndex();
            updatePreTagOutline(pres[blockIndex]);
            updateScrollTop();
            return true;
        }
        return false;
    });

    const handleArrowDownPressed = action(() => {
        if (handleTextAreaKeyDown("ArrowDown")) {
            const pres = chatWindowRef.current?.querySelectorAll("pre");
            let blockIndex = GlobalModel.sidebarchatModel.getSelectedCodeBlockIndex();
            if (!pres) return false;

            if (blockIndex == null) return false;

            if (blockIndex < pres.length - 1 && blockIndex >= 0) {
                blockIndex++;
                GlobalModel.sidebarchatModel.setSelectedCodeBlockIndex(blockIndex);
                updatePreTagOutline(pres[blockIndex]);
            } else {
                GlobalModel.sidebarchatModel.setFocus(true);
                textAreaRef.current?.focus();
                updatePreTagOutline();
                GlobalModel.sidebarchatModel.setSelectedCodeBlockIndex(null);
            }
            updateScrollTop();
            return true;
        }
        return false;
    });

    const handleTextAreaKeyDown = (key: "ArrowUp" | "ArrowDown") => {
        const textarea = textAreaRef.current;
        if (!textarea) return false;

        const cursorPosition = textarea.selectionStart;
        const textBeforeCursor = textarea.value.slice(0, cursorPosition);
        const blockIndex = GlobalModel.sidebarchatModel.getSelectedCodeBlockIndex();

        if ((textBeforeCursor.indexOf("\n") === -1 && cursorPosition === 0 && key === "ArrowUp") || blockIndex != null) {
            return true;
        }
        GlobalModel.sidebarchatModel.setFocus(true);
        return false;
    };

    const handleSetCmdInputValue = action((cmd?: string) => {
        if (cmd) {
            setCmdInputValue(cmd);
        } else {
            const pres = chatWindowRef.current?.querySelectorAll("pre");
            if (pres) {
                const selectedIdx = GlobalModel.sidebarchatModel.getSelectedCodeBlockIndex();
                pres.forEach((preElement, idx) => {
                    if (selectedIdx === idx) {
                        const codeElement = preElement.querySelector("code");
                        if (codeElement) {
                            const command = codeElement.textContent?.replace(/\n$/, "") || "";
                            setCmdInputValue(command);
                        }
                    }
                });
            }
        }
        return true;
    });

    const setCmdInputValue = action((cmd: string) => {
        GlobalModel.sidebarchatModel.setCmdToExec(cmd);
        GlobalModel.sidebarchatModel.resetFocus();
        GlobalModel.inputModel.curLine = cmd;
        GlobalModel.inputModel.giveFocus();
    });

    const formChatMessage = (cmdAndOutput: any) => {
        const { cmd, output, usedRows, isError } = cmdAndOutput;
        if (!cmd) return "";

        let escapedOutput = output ? output.replace(/`/g, "\\`") : "";
        
        if (usedRows > 100) {
            const outputLines = escapedOutput.split("\n");
            const leadingLines = outputLines.slice(0, 10).join("\n");
            const trailingLines = outputLines.slice(-10).join("\n");
            escapedOutput = `${leadingLines}\n.\n.\n.\n${trailingLines}`;
        }

        let chatMessage = `I ran the command: \`${cmd}\` and got the following output:\n\n`;
        if (escapedOutput !== "") {
            chatMessage += `\`\`\`\n${escapedOutput}\n\`\`\``;
        }
        chatMessage += isError ? "\n\nHow should I fix this?" : "\n\nWhat should I do next?";
        
        return chatMessage;
    };

    const chatMessageItems = GlobalModel.inputModel.AICmdInfoChatItems.slice();
    const hasValue = value.trim().length > 0;
    const selectedProviderData = aiProviders.find(p => p.id === selectedProvider);

    return (
        <div ref={sidebarRef} className="h-full flex flex-col bg-background text-foreground relative overflow-hidden">
            <div className="absolute inset-0 w-full h-full -z-10 bg-gradient-radial from-[rgb(17,17,17)] at-[50%_-20%] to-[rgb(56,56,143)] to-40% bg-[180%_180%]" />
            <div className="relative z-10 flex-1 overflow-hidden">
                {chatMessageItems.length === 0 ? (
                    <div className="h-full flex items-center justify-center p-8">
                        <div className="max-w-3xl w-full px-4">
                            <div className="text-center mb-12">
                                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-purple-500/20">
                                    <Sparkles className="w-12 h-12 text-white" />
                                </div>
                                <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                                    How can I help you today?
                                </h1>
                                <p className="text-muted-foreground text-lg">Ask me anything about your code or terminal</p>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <Card className="p-5 rounded-2xl bg-white/[0.03] backdrop-blur border border-white/[0.05] hover:bg-white/[0.06] hover:border-white/[0.1] transition-all cursor-pointer group text-left">
                                    <h3 className="font-semibold text-card-foreground mb-2 group-hover:text-white transition-colors flex items-center gap-2">
                                        <span className="text-xl">🐛</span> Debug an error
                                    </h3>
                                    <p className="text-sm text-muted-foreground group-hover:text-gray-400 transition-colors">"Help me fix this TypeError"</p>
                                </Card>
                                <Card className="p-5 rounded-2xl bg-white/[0.03] backdrop-blur border border-white/[0.05] hover:bg-white/[0.06] hover:border-white/[0.1] transition-all cursor-pointer group text-left">
                                    <h3 className="font-semibold text-card-foreground mb-2 group-hover:text-white transition-colors flex items-center gap-2">
                                        <span className="text-xl">✍️</span> Write a script
                                    </h3>
                                    <p className="text-sm text-muted-foreground group-hover:text-gray-400 transition-colors">"Create a Python script to..."</p>
                                </Card>
                                <Card className="p-5 rounded-2xl bg-white/[0.03] backdrop-blur border border-white/[0.05] hover:bg-white/[0.06] hover:border-white/[0.1] transition-all cursor-pointer group text-left">
                                    <h3 className="font-semibold text-card-foreground mb-2 group-hover:text-white transition-colors flex items-center gap-2">
                                        <span className="text-xl">💡</span> Explain code
                                    </h3>
                                    <p className="text-sm text-muted-foreground group-hover:text-gray-400 transition-colors">"What does this function do?"</p>
                                </Card>
                                <Card className="p-5 rounded-2xl bg-white/[0.03] backdrop-blur border border-white/[0.05] hover:bg-white/[0.06] hover:border-white/[0.1] transition-all cursor-pointer group text-left">
                                    <h3 className="font-semibold text-card-foreground mb-2 group-hover:text-white transition-colors flex items-center gap-2">
                                        <span className="text-xl">🖥️</span> Terminal help
                                    </h3>
                                    <p className="text-sm text-muted-foreground group-hover:text-gray-400 transition-colors">"How do I use git rebase?"</p>
                                </Card>
                            </div>
                        </div>
                    </div>
                ) : (
                    <ChatWindow
                        chatWindowRef={chatWindowRef}
                        onRendered={handleChatWindowRendered}
                        onSetCmdInputValue={handleSetCmdInputValue}
                    />
                )}
            </div>
            <div className="relative z-10 p-4 bg-gradient-to-t from-background to-transparent">
                <Card className="rounded-[28px] p-2 shadow-2xl bg-muted/80 backdrop-blur-xl border border-border">
                    <div className="flex items-end gap-2">
                        <div className="flex-1">
                            <textarea
                                ref={textAreaRef}
                                autoComplete="off"
                                autoCorrect="off"
                                rows={1}
                                className="w-full resize-none border-0 bg-transparent p-3 text-foreground placeholder:text-muted-foreground focus:ring-0 focus-visible:outline-none min-h-[52px] font-mono text-[15px] leading-relaxed"
                                onBlur={handleBlur}
                                onFocus={handleTextAreaFocus}
                                onMouseDown={handleTextAreaMouseDown}
                                onChange={handleTextAreaChange}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        handleEnterKeyPressed();
                                    }
                                }}
                                style={{ fontSize: termFontSize }}
                                placeholder="Message AI Assistant..."
                                value={value}
                            />
                        </div>
                    </div>
                    <div className="mt-1 px-1 pb-1">
                        <div className="flex items-center justify-between">
                            <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                                <SelectTrigger className="w-[180px] h-8 bg-transparent border-0 text-muted-foreground hover:text-foreground focus:ring-0 focus:ring-offset-0">
                                    <SelectValue>
                                        <div className="flex items-center gap-2">
                                            <span>{selectedProviderData?.icon}</span>
                                            <span className="text-sm">{selectedProviderData?.name}</span>
                                        </div>
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent className="bg-muted border-border text-foreground">
                                    {aiProviders.map(provider => (
                                        <SelectItem
                                            key={provider.id}
                                            value={provider.id}
                                            className="text-muted-foreground hover:text-foreground focus:bg-accent focus:text-accent-foreground"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span>{provider.icon}</span>
                                                <span>{provider.name}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                type="submit"
                                disabled={!hasValue}
                                onClick={() => handleEnterKeyPressed()}
                                size="icon"
                                className={cn(
                                    "h-9 w-9",
                                    hasValue ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-secondary text-secondary-foreground cursor-not-allowed"
                                )}
                            >
                                <Send className="h-5 w-5" />
                                <span className="sr-only">Send message</span>
                            </Button>
                        </div>
                    </div>
                </Card>
                {GlobalModel.sidebarchatModel.getSelectedCodeBlockIndex() != null && (
                    <div className="mt-2 text-xs text-muted-foreground text-center">
                        Press Enter to execute selected code
                    </div>
                )}
            </div>
        </div>
    );
});

export { ChatSidebar };