// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback } from "react";
import { observer } from "mobx-react";
import { GlobalModel } from "@/models";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Bot, Cloud, Sparkles } from "lucide-react";

interface AIProviderOption {
    value: string;
    label: string;
    icon?: React.ReactNode;
}

const AI_PROVIDERS: AIProviderOption[] = [
    { value: "openai", label: "OpenAI", icon: <Bot className="h-4 w-4" /> },
    { value: "azure", label: "Azure OpenAI", icon: <Cloud className="h-4 w-4" /> },
    { value: "gemini", label: "Google Gemini", icon: <Sparkles className="h-4 w-4" /> },
];

const AIProviderDropdown: React.FC = observer(() => {
    const currentProvider = GlobalModel.aiProvider.get() || "";

    const handleProviderChange = useCallback((value: string) => {
        GlobalModel.setAIProvider(value);
        
        // Store the choice persistently
        if (value) {
            GlobalModel.submitCommand("client", "setconfig", ["aiprovider", value], {}, false);
        }
    }, []);

    const currentProviderObj = AI_PROVIDERS.find(p => p.value === currentProvider);

    return (
        <div className="ai-provider-wrapper" style={{ display: 'inline-flex', marginLeft: '10px', verticalAlign: 'middle' }}>
            <Select value={currentProvider} onValueChange={handleProviderChange}>
                <SelectTrigger className="ai-provider-trigger" style={{
                    height: '24px',
                    padding: '0 8px',
                    fontSize: '12px',
                    backgroundColor: 'var(--app-panel-bg-color)',
                    border: '1px solid var(--app-border-color)',
                    color: 'var(--app-text-color)',
                    borderRadius: '4px',
                    minWidth: '140px'
                }}>
                    <SelectValue placeholder="Choose provider">
                        {currentProviderObj && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {React.cloneElement(currentProviderObj.icon as React.ReactElement, { 
                                    style: { width: '12px', height: '12px' } 
                                })}
                                <span>{currentProviderObj.label}</span>
                            </div>
                        )}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent 
                    className="ai-provider-content"
                    style={{
                        backgroundColor: 'var(--app-panel-bg-color)',
                        border: '1px solid var(--app-border-color)',
                        color: 'var(--app-text-color)',
                        fontSize: '12px',
                        minWidth: '140px',
                        borderRadius: '6px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)'
                    }}>
                    {AI_PROVIDERS.map((provider) => (
                        <SelectItem 
                            key={provider.value} 
                            value={provider.value} 
                            className="ai-provider-item"
                            style={{
                                fontSize: '12px',
                                padding: '6px 12px',
                                cursor: 'pointer'
                            }}>
                            <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px',
                                width: '100%'
                            }}>
                                {React.cloneElement(provider.icon as React.ReactElement, { 
                                    style: { 
                                        width: '14px', 
                                        height: '14px', 
                                        flexShrink: 0,
                                        opacity: currentProvider === provider.value ? 1 : 0.7
                                    } 
                                })}
                                <span style={{ 
                                    flex: 1,
                                    fontWeight: currentProvider === provider.value ? 500 : 400 
                                }}>
                                    {provider.label}
                                </span>
                                {currentProvider === provider.value && (
                                    <span style={{
                                        width: '4px',
                                        height: '4px',
                                        borderRadius: '50%',
                                        backgroundColor: '#4ade80',
                                        marginLeft: 'auto'
                                    }} />
                                )}
                            </div>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
});

export { AIProviderDropdown };