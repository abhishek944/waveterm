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

export const AIProviderDropdown: React.FC = observer(() => {
    const aiProviderFromObservable = GlobalModel.aiProvider.get();
    const clientData = GlobalModel.clientData.get();
    const savedProvider = clientData?.aiopts?.default;

    const currentProvider = aiProviderFromObservable || savedProvider || "";

    const handleProviderChange = useCallback((value: string) => {
        GlobalModel.setAIProvider(value);

        if (value) {
            GlobalModel.submitCommand("client", "set", null, { defaultprovider: value }, false);
        }
    }, []);

    const currentProviderObj = AI_PROVIDERS.find((p) => p.value === currentProvider);

    return (
        <div className="inline-flex ml-2.5 align-middle">
            <Select value={currentProvider} onValueChange={handleProviderChange}>
                <SelectTrigger className="h-6 px-2 text-xs bg-panel border border-border text-main rounded min-w-[140px]">
                    <SelectValue placeholder="Choose provider">
                        {currentProviderObj && (
                            <div className="flex items-center gap-1.5">
                                {React.cloneElement(currentProviderObj.icon as React.ReactElement, {
                                    className: "w-3 h-3",
                                })}
                                <span>{currentProviderObj.label}</span>
                            </div>
                        )}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-panel border border-border text-main text-xs min-w-[140px] rounded-md shadow-lg">
                    {AI_PROVIDERS.map((provider) => (
                        <SelectItem
                            key={provider.value}
                            value={provider.value}
                            className="text-xs px-3 py-1.5 cursor-pointer"
                        >
                            <div className="flex items-center gap-2 w-full">
                                {React.cloneElement(provider.icon as React.ReactElement, {
                                    className: `w-3.5 h-3.5 flex-shrink-0 ${
                                        currentProvider === provider.value ? "opacity-100" : "opacity-70"
                                    }`,
                                })}
                                <span
                                    className={`flex-1 ${
                                        currentProvider === provider.value ? "font-medium" : "font-normal"
                                    }`}
                                >
                                    {provider.label}
                                </span>
                                {currentProvider === provider.value && (
                                    <span className="w-1 h-1 rounded-full bg-green-400 ml-auto" />
                                )}
                            </div>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
});