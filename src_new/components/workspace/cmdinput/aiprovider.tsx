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
import { cn } from "@/lib/utils";

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

// Custom SelectItem that hides the checkmark and adjusts padding
const CustomSelectItem = React.forwardRef<
    React.ElementRef<typeof SelectItem>,
    React.ComponentPropsWithoutRef<typeof SelectItem> & { children: React.ReactNode }
>(({ className, children, ...props }, ref) => (
    <SelectItem
        ref={ref}
        className={cn(
            "pl-3 [&>span:first-child]:hidden", // Hide the checkmark span and adjust padding
            className
        )}
        {...props}
    >
        {children}
    </SelectItem>
));
CustomSelectItem.displayName = "CustomSelectItem";

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
                <SelectTrigger className="h-6 px-2 text-xs bg-black border border-gray-600 text-white rounded min-w-[140px]">
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
                <SelectContent className="bg-black/100 border border-gray-600 text-white text-xs min-w-[140px] rounded-md shadow-lg z-50">
                    {AI_PROVIDERS.map((provider) => (
                        <CustomSelectItem
                            key={provider.value}
                            value={provider.value}
                            className="text-xs py-1.5 cursor-pointer"
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
                        </CustomSelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
});