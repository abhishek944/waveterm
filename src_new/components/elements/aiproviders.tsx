// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import * as mobxReact from "mobx-react";
import * as mobx from "mobx";
import { GlobalModel, GlobalCommandRunner } from "@/models";
import { Toggle, InlineSettingsTextEdit, Button } from "@/common/elements";
import { commandRtnHandler, isBlank } from "@/util/util";

const AiProviders: React.FC = mobxReact.observer(() => {
    const [verifyingProvider, setVerifyingProvider] = React.useState<string | null>(null);
    const [isVerifying, setIsVerifying] = React.useState(false);

    const handleAiOptsChange = React.useCallback((newAiOpts: any) => {
        console.log("Setting AI opts:", newAiOpts);
        const prtn = GlobalCommandRunner.setAIOpts(newAiOpts);
        commandRtnHandler(prtn, null, () => {
            console.log("AI opts set successfully");
        });
    }, []);

    const handleProviderChange = React.useCallback((provider: "gemini" | "openai" | "azure", key: string, value: string) => {
        console.log(`[AiProviders.handleProviderChange] provider: ${provider}, key: ${key}, value: ${value}`);
        const cdata: ClientDataType = GlobalModel.clientData.get();
        const currentAiOpts = cdata.aiopts ?? {};
        
        // If this is the first time setting an API key and no provider is selected,
        // automatically select this provider
        let defaultProvider = (currentAiOpts as any).default;
        if (!defaultProvider || defaultProvider === "") {
            defaultProvider = provider;
        }
        
        const providerOpts = { ...(currentAiOpts[provider] ?? {}), [key]: value };
        const newAiOpts = { 
            ...currentAiOpts,
            default: defaultProvider,
            [provider]: providerOpts 
        };
        
        console.log("[AiProviders.handleProviderChange] newAiOpts:", newAiOpts);
        handleAiOptsChange(newAiOpts);
    }, [handleAiOptsChange]);

    const handleToggleProvider = React.useCallback((provider: "gemini" | "openai" | "azure", enabled: boolean) => {
        const cdata: ClientDataType = GlobalModel.clientData.get();
        const currentAiOpts = cdata.aiopts ?? {};
        
        // Create updated options with enabled status
        const providerOpts = { ...(currentAiOpts[provider] ?? {}), enabled };
        const newAiOpts = { 
            ...currentAiOpts,
            [provider]: providerOpts 
        };

        handleAiOptsChange(newAiOpts);
    }, [handleAiOptsChange]);
    
    const runVerification = React.useCallback(async (provider: "gemini" | "openai" | "azure") => {
        try {
            console.log("[AiProviders.runVerification] Sending verification command");
            const result = await GlobalCommandRunner.verifyAIProvider(provider);
            console.log("[AiProviders.runVerification] Response received:", result);
            
            if (!result.success) {
                console.error("[AiProviders.runVerification] Verification failed:", result.error);
            } else {
                console.log("[AiProviders.runVerification] Verification completed successfully");
            }
        } catch (error) {
            console.error("[AiProviders.runVerification] Exception caught:", error);
        } finally {
            // Always reset the verifying state
            setIsVerifying(false);
            setVerifyingProvider(null);
            console.log("[AiProviders.runVerification] Reset isVerifying to false");
        }
    }, []);

    const handleVerifyProvider = React.useCallback((provider: "gemini" | "openai" | "azure") => {
        console.log("[AiProviders.handleVerifyProvider] Starting verification for:", provider);
        
        // Set verifying state
        setIsVerifying(true);
        setVerifyingProvider(provider);
        
        // Use setTimeout to ensure the UI updates before running verification
        setTimeout(() => {
            console.log("[AiProviders.handleVerifyProvider] Running verification after timeout");
            runVerification(provider);
        }, 10);
    }, [runVerification]);

    const cdata: ClientDataType = GlobalModel.clientData.get();
    console.log("[AiProviders] render - clientData:", cdata);
    console.log("[AiProviders] render - aiopts:", cdata?.aiopts);
    
    const defaultProvider = cdata.aiopts?.default ?? "openai";
    const aiOpts = { default: defaultProvider, ...(cdata.aiopts ?? {}) };
    const geminiOpts = aiOpts.gemini ?? {};
    const openAIOpts = aiOpts.openai ?? {};
    const azureOpts = aiOpts.azure ?? {};
    const selectedProvider = defaultProvider;
    
    // Helper function to display masked API key
    const getMaskedValue = (value: string) => {
        if (!value) return "(not set)";
        return "••••••••" + value.slice(-4);
    };
    
    // Helper function to get connection status display
    const getConnectionStatus = (provider: "gemini" | "openai" | "azure") => {
        // Check verifying state first, before looking at provider options
        const providerIsVerifying = isVerifying && verifyingProvider === provider;
        console.log(`[AiProviders.getConnectionStatus] provider: ${provider}, isVerifying: ${providerIsVerifying}`);
        
        if (providerIsVerifying) {
            return <span className="connection-status verifying">Verifying...</span>;
        }
        
        const providerOpts = aiOpts[provider];
        if (!providerOpts) return null;
        
        const status = providerOpts.connectionstatus;
        
        if (status === "connected") {
            return <span className="connection-status connected">Connected</span>;
        } else if (status === "failed") {
            return <span className="connection-status failed">Failed</span>;
        }
        
        return null;
    };
    
    // Helper function to check if we should show verify button
    const shouldShowVerify = (provider: "gemini" | "openai" | "azure") => {
        const providerOpts = aiOpts[provider];
        if (!providerOpts) return false;
        
        // Show verify button if API key is set (regardless of connection status)
        let hasApiKey = false;
        if (provider === "azure") {
            const azureProviderOpts = providerOpts as AzureOpenAIOptsType;
            hasApiKey = !!(azureProviderOpts.apitoken && azureProviderOpts.baseurl && azureProviderOpts.deploymentname);
        } else {
            hasApiKey = !!providerOpts.apitoken;
        }
            
        return hasApiKey;
    };

    return (
        <div>
            <div className="settings-group">
                <div className="settings-group-title">
                    <div>Gemini</div>
                    <Toggle
                        checked={geminiOpts.enabled || false}
                        onChange={(enabled) => handleToggleProvider("gemini", enabled)}
                    />
                </div>
                <div className="settings-field">
                    <div className="settings-label">Model</div>
                    <div className="settings-input">
                        <InlineSettingsTextEdit
                            placeholder="Model (e.g., gemini-pro)"
                            text={geminiOpts.model || "(not set)"}
                            value={geminiOpts.model || ""}
                            onChange={(val) => handleProviderChange("gemini", "model", val)}
                            maxLength={256}
                            showIcon={true}
                        />
                    </div>
                </div>
                <div className="settings-field">
                    <div className="settings-label">API Key</div>
                    <div className="settings-input">
                        <InlineSettingsTextEdit
                            placeholder="API Key"
                            text={getMaskedValue(geminiOpts.apitoken)}
                            value={geminiOpts.apitoken || ""}
                            onChange={(val) => handleProviderChange("gemini", "apitoken", val)}
                            maxLength={256}
                            showIcon={true}
                        />
                    </div>
                </div>
                <div className="settings-field">
                    <div className="settings-label"></div>
                    <div className="settings-input ai-verify-row">
                        {shouldShowVerify("gemini") && (
                            <Button
                                className="secondary small"
                                onClick={() => handleVerifyProvider("gemini")}
                                disabled={isVerifying}
                            >
                                Verify
                            </Button>
                        )}
                        {getConnectionStatus("gemini")}
                    </div>
                </div>
            </div>
            <div className="settings-group">
                <div className="settings-group-title">
                    <div>OpenAI</div>
                    <Toggle
                        checked={openAIOpts.enabled || false}
                        onChange={(enabled) => handleToggleProvider("openai", enabled)}
                    />
                </div>
                <div className="settings-field">
                    <div className="settings-label">Model</div>
                    <div className="settings-input">
                        <InlineSettingsTextEdit
                            placeholder="Model (e.g., gpt-3.5-turbo)"
                            text={openAIOpts.model || "(not set)"}
                            value={openAIOpts.model || ""}
                            onChange={(val) => handleProviderChange("openai", "model", val)}
                            maxLength={256}
                            showIcon={true}
                        />
                    </div>
                </div>
                <div className="settings-field">
                    <div className="settings-label">API Key</div>
                    <div className="settings-input">
                        <InlineSettingsTextEdit
                            placeholder="API Key"
                            text={getMaskedValue(openAIOpts.apitoken)}
                            value={openAIOpts.apitoken || ""}
                            onChange={(val) => handleProviderChange("openai", "apitoken", val)}
                            maxLength={256}
                            showIcon={true}
                        />
                    </div>
                </div>
                <div className="settings-field">
                    <div className="settings-label"></div>
                    <div className="settings-input ai-verify-row">
                        {shouldShowVerify("openai") && (
                            <Button
                                className="secondary small"
                                onClick={() => handleVerifyProvider("openai")}
                                disabled={isVerifying}
                            >
                                Verify
                            </Button>
                        )}
                        {getConnectionStatus("openai")}
                    </div>
                </div>
            </div>
            <div className="settings-group">
                <div className="settings-group-title">
                    <div>Azure OpenAI</div>
                    <Toggle
                        checked={azureOpts.enabled || false}
                        onChange={(enabled) => handleToggleProvider("azure", enabled)}
                    />
                </div>
                <div className="settings-field">
                    <div className="settings-label">Base URL</div>
                    <div className="settings-input">
                        <InlineSettingsTextEdit
                            placeholder="Base URL"
                            text={azureOpts.baseurl || "(not set)"}
                            value={azureOpts.baseurl || ""}
                            onChange={(val) => handleProviderChange("azure", "baseurl", val)}
                            maxLength={256}
                            showIcon={true}
                        />
                    </div>
                </div>
                <div className="settings-field">
                    <div className="settings-label">Deployment Name</div>
                    <div className="settings-input">
                        <InlineSettingsTextEdit
                            placeholder="Deployment Name"
                            text={azureOpts.deploymentname || "(not set)"}
                            value={azureOpts.deploymentname || ""}
                            onChange={(val) => handleProviderChange("azure", "deploymentname", val)}
                            maxLength={256}
                            showIcon={true}
                        />
                    </div>
                </div>
                <div className="settings-field">
                    <div className="settings-label">API Key</div>
                    <div className="settings-input">
                        <InlineSettingsTextEdit
                            placeholder="API Key"
                            text={getMaskedValue(azureOpts.apitoken)}
                            value={azureOpts.apitoken || ""}
                            onChange={(val) => handleProviderChange("azure", "apitoken", val)}
                            maxLength={256}
                            showIcon={true}
                        />
                    </div>
                </div>
                <div className="settings-field">
                    <div className="settings-label"></div>
                    <div className="settings-input ai-verify-row">
                        {shouldShowVerify("azure") && (
                            <Button
                                className="secondary small"
                                onClick={() => handleVerifyProvider("azure")}
                                disabled={isVerifying}
                            >
                                Verify
                            </Button>
                        )}
                        {getConnectionStatus("azure")}
                    </div>
                </div>
            </div>
            <div className="settings-group">
                <div className="settings-group-title">
                    <div>Default Provider</div>
                </div>
                <div className="settings-field">
                    <div className="settings-label">Select Default</div>
                    <div className="settings-input">
                        <select 
                            value={defaultProvider} 
                            onChange={(e) => {
                                const newDefault = e.target.value as "gemini" | "openai" | "azure";
                                const newAiOpts = { ...aiOpts, default: newDefault };
                                handleAiOptsChange(newAiOpts);
                            }}
                            className="settings-select"
                        >
                            <option value="openai">OpenAI</option>
                            <option value="gemini">Gemini</option>
                            <option value="azure">Azure OpenAI</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    );
});

export { AiProviders };