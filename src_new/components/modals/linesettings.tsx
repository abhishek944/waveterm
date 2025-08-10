// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useEffect } from "react";
import { observer } from "mobx-react";
import { action } from "mobx";
import { GlobalModel, GlobalCommandRunner } from "@/models";
import { PluginModel } from "@/plugins/plugins";
import { commandRtnHandler } from "@/utils/util";

const LineSettingsModal: React.FC = observer(() => {
    const [rendererDropdownActive, setRendererDropdownActive] = useState(false);
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

    const toggleRendererDropdown = (): void => {
        setRendererDropdownActive(!rendererDropdownActive);
    };

    const clickSetRenderer = async (renderer: string): Promise<void> => {
        const line = getLine();
        if (line == null) {
            return;
        }
        const prtn = GlobalCommandRunner.lineSet(line.lineid, { renderer: renderer });
        commandRtnHandler(prtn, { set: setErrorMessage } as any);
        setRendererDropdownActive(false);
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
            value: null,
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
        <Modal className="w-[640px]">
            <Modal.Header onClose={closeModal} title={`Block Settings (#${line.linenum})`} />
            <div className="flex flex-col px-5 gap-1 w-full">
                <div className="settings-field">
                    <div className="settings-label">Renderer</div>
                    <div className="settings-input">
                        <Dropdown
                            className="renderer-dropdown"
                            options={getOptions(plugins)}
                            defaultValue={renderer}
                            onChange={clickSetRenderer}
                        />
                    </div>
                </div>
                <SettingsError errorMessage={errorMessage} />
                <div className="h-[50px]" />
            </div>
            <Modal.Footer cancelLabel="Close" onCancel={closeModal} keybindings={true} />
        </Modal>
    );
});

export { LineSettingsModal };