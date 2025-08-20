// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import * as mobx from "mobx";
import * as mobxReact from "mobx-react";
import { boundMethod } from "autobind-decorator";
import { Button } from "@/components/ui/button";
import { InlineSettingsTextEdit } from "@/components/ui/inlinesettingstextedit";

interface AllowCommandsProps {
    allowCommands: string[];
    onChange: (commands: string[]) => void;
}

@mobxReact.observer
class AllowCommands extends React.Component<AllowCommandsProps, {}> {
    @mobx.observable
    editingIndex: number = -1;

    @mobx.observable
    newCommand: string = "";

    constructor(props: AllowCommandsProps) {
        super(props);
        mobx.makeObservable(this);
    }

    @boundMethod
    handleAddCommand() {
        if (this.newCommand.trim()) {
            // Validate regex
            try {
                new RegExp(this.newCommand.trim());
                const newCommands = [...this.props.allowCommands, this.newCommand.trim()];
                this.props.onChange(newCommands);
                mobx.runInAction(() => {
                    this.newCommand = "";
                });
            } catch (error) {
                // TODO: Show error message to user
                console.error("Invalid regex pattern:", error);
            }
        }
    }

    @boundMethod
    handleRemoveCommand(index: number) {
        const newCommands = this.props.allowCommands.filter((_, i) => i !== index);
        this.props.onChange(newCommands);
    }

    @boundMethod
    handleEditCommand(index: number, newValue: string) {
        if (newValue.trim()) {
            try {
                new RegExp(newValue.trim());
                const newCommands = [...this.props.allowCommands];
                newCommands[index] = newValue.trim();
                this.props.onChange(newCommands);
            } catch (error) {
                // TODO: Show error message to user
                console.error("Invalid regex pattern:", error);
            }
        }
    }

    @boundMethod
    handleNewCommandChange(value: string) {
        mobx.runInAction(() => {
            this.newCommand = value;
        });
    }

    @boundMethod
    handleKeyPress(event: React.KeyboardEvent) {
        if (event.key === "Enter") {
            event.preventDefault();
            this.handleAddCommand();
        }
    }

    render() {
        const { allowCommands } = this.props;

        return (
            <div className="space-y-3">
                <div className="text-sm text-gray-400">
                    Define regex patterns for commands that AI can execute automatically. Each pattern should be a valid
                    regular expression.
                </div>

                {/* Existing commands */}
                <div className="space-y-2">
                    {allowCommands.map((command, index) => (
                        <div
                            key={index}
                            className="flex items-center gap-2 p-2 border border-gray-700 rounded bg-gray-800/50"
                        >
                            <div className="flex-1 font-mono text-sm">
                                <InlineSettingsTextEdit
                                    placeholder="Regex pattern"
                                    text={command}
                                    value={command}
                                    onChange={(val) => this.handleEditCommand(index, val)}
                                    maxLength={256}
                                    showIcon={false}
                                />
                            </div>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => this.handleRemoveCommand(index)}
                                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            >
                                ×
                            </Button>
                        </div>
                    ))}
                </div>

                {/* Add new command */}
                <div className="flex items-center gap-2">
                    <div className="flex-1">
                        <input
                            type="text"
                            placeholder="Enter regex pattern (e.g., ^ls.*|^cat.*)"
                            value={this.newCommand}
                            onChange={(e) => this.handleNewCommandChange(e.target.value)}
                            onKeyPress={this.handleKeyPress}
                            className="w-full px-3 py-2 border border-gray-700 rounded bg-black text-white text-sm outline-none focus:border-green-500 font-mono"
                        />
                    </div>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={this.handleAddCommand}
                        disabled={!this.newCommand.trim()}
                    >
                        + Add
                    </Button>
                </div>

                {/* Help text */}
                {allowCommands.length === 0 && (
                    <div className="text-xs text-gray-500 italic">
                        No patterns defined. Add patterns to allow AI to execute specific commands automatically.
                    </div>
                )}

                <div className="text-xs text-gray-500">
                    <div className="font-medium mb-1">Examples:</div>
                    <div className="space-y-1 font-mono">
                        <div>^ls.*$ - Allow any ls command</div>
                        <div>^cat\s+.*\.txt$ - Allow cat on .txt files</div>
                        <div>^git\s+(status|log|diff)$ - Allow specific git commands</div>
                    </div>
                </div>
            </div>
        );
    }
}

export { AllowCommands };
