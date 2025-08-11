// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useEffect } from "react";
import { observer } from "mobx-react";
import { action } from "mobx";
import { GlobalModel, GlobalCommandRunner } from "@/models";
import { PluginModel } from "@/plugins/plugins";
import { commandRtnHandler } from "@/utils/util";
import { SettingsError } from "@/components/ui/settingserror";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem } from "@/components/ui/select";

const LineSettingsModal: React.FC = observer(() => {
    const [errorMessage, setErrorMessage] = useState<string>(null);
    const linenum = GlobalModel.lineSettingsModal.get();

    const closeModal = (): void => {
        action(() => {
            GlobalModel.lineSettingsModal.set(null);
        })();
        GlobalModel.modalsModel.popModal();
    };

    const getLine = (): LineType => {
        const screen = GlobalModel.getActiveScreen();
        if (screen == null) {
            return null;
        }
        return screen.getLineByNum(linenum);
    };

    const handleChangeArchived = async (val: boolean): Promise<void> => {
        const line = getLine();
        if (line == null) {
            return;
        }
        const prtn = GlobalCommandRunner.lineArchive(line.lineid, val);
        commandRtnHandler(prtn, { set: setErrorMessage } as any);
    };

    const clickSetRenderer = async (renderer: string): Promise<void> => {
        const line = getLine();
        if (line == null) {
            return;
        }
        const newRenderer = renderer === "terminal" ? null : renderer;
        const prtn = GlobalCommandRunner.lineSet(line.lineid, { renderer: newRenderer });
        commandRtnHandler(prtn, { set: setErrorMessage } as any);
    };

    const getOptions = (plugins: RendererPluginType[]) => {
        // Add label and value to each object in the array
        const options = plugins.map((item) => ({
            ...item,
            label: item.name,
            value: item.name,
        }));

        // Create an additional object with label "terminal" and value null
        const terminalItem = {
            label: "terminal",
            value: "terminal",
            name: null,
            rendererType: null,
            heightType: null,
            dataType: null,
            collapseType: null,
            globalCss: null,
            mimeTypes: null,
        };

        // Create an additional object with label "none" and value none
        const noneItem = {
            label: "none",
            value: "none",
            name: null,
            rendererType: null,
            heightType: null,
            dataType: null,
            collapseType: null,
            globalCss: null,
            mimeTypes: null,
        };

        // Combine the options with the terminal item
        return [terminalItem, ...options, noneItem];
    };

    if (linenum == null) {
        return null;
    }

    const line = getLine();
    if (line == null) {
        useEffect(() => {
            closeModal();
        }, []);
        return null;
    }

    const plugins = PluginModel.rendererPlugins;
    const renderer = line.renderer ?? "terminal";

    return (
        <Dialog open={true} onOpenChange={closeModal}>
            <DialogContent className="w-[640px]">
                <DialogHeader>
                    <DialogTitle>{`Block Settings (#${line.linenum})`}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col px-5 gap-1 w-full">
                    <div className="settings-field">
                        <div className="settings-label">Renderer</div>
                        <div className="settings-input">
                            <Select onValueChange={clickSetRenderer} defaultValue={renderer}>
                                <SelectTrigger className="w-[412px]">{renderer}</SelectTrigger>
                                <SelectContent>
                                    {getOptions(plugins).map((opt) => (
                                        <SelectItem
                                            key={String(opt.value ?? "none")}
                                            value={String(opt.value ?? "none")}
                                        >
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <SettingsError errorMessage={errorMessage} onDismiss={() => setErrorMessage(null)} />
                    <div className="h-[50px]" />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={closeModal}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});

export { LineSettingsModal };
