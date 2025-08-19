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
import { Bot, Cloud, Sparkle } from "lucide-react";

interface AIProviderOption {
    value: string;
    label: string;
    icon?: React.ReactNode;
}

const AI_PROVIDERS: AIProviderOption[] = [
    { value: "openai", label: "OpenAI", icon: <Bot className="h-4 w-4" /> },
    { value: "azure", label: "Azure OpenAI", icon: <Cloud className="h-4 w-4" /> },
    { value: "gemini", label: "Gemini", icon: <Sparkle className="h-4 w-4" /> },
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
        <Select value={currentProvider} onValueChange={handleProviderChange}>
                <SelectTrigger className="h-7 px-3 text-xs bg-gradient-to-r from-gray-800 to-gray-900 border border-gray-700 text-white rounded-lg w-[140px] hover:from-gray-700 hover:to-gray-800 transition-all duration-200">
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
                <SelectContent className="bg-gradient-to-b from-gray-900 to-black border border-gray-700 text-white text-xs rounded-lg shadow-xl">
                    {AI_PROVIDERS.map((provider) => (
                        <SelectItem
                            key={provider.value}
                            value={provider.value}
                            className="hover:bg-gradient-to-r hover:from-purple-600/20 hover:to-pink-600/20"
                        >
                            {provider.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
    );
});