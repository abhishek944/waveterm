// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import * as mobxReact from "mobx-react";
import * as mobx from "mobx";
import { GlobalModel, GlobalCommandRunner, RemotesModel } from "@/models";
import { Toggle, InlineSettingsTextEdit, SettingsError, Dropdown } from "@/common/elements";
import { commandRtnHandler, isBlank } from "@/util/util";
import { getTermThemes } from "@/util/themeutil";
import * as appconst from "@/app/appconst";
import { MainView } from "@/common/elements/mainview";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";

import { AiProviders } from "./aiproviders";

const ClientSettingsKeybindings: React.FC = () => {
    React.useEffect(() => {
        const clientSettingsViewModel = GlobalModel.clientSettingsViewModel;
        const keybindManager = GlobalModel.keybindManager;
        
        keybindManager.registerKeybinding("mainview", "clientsettings", "generic:cancel", (waveEvent) => {
            clientSettingsViewModel.closeView();
            return true;
        });

        return () => {
            GlobalModel.keybindManager.unregisterDomain("clientsettings");
        };
    }, []);

    return null;
};

interface ClientSettingsViewProps {
    model: RemotesModel;
}

const ClientSettingsView: React.FC<ClientSettingsViewProps> = mobxReact.observer(({ model }) => {
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

    const dismissError = React.useCallback(() => {
        setErrorMessage(null);
    }, []);

    const handleChangeFontSize = React.useCallback((fontSize: string) => {
        const newFontSize = Number(fontSize);
        if (GlobalModel.getTermFontSize() === newFontSize) {
            return;
        }
        const prtn = GlobalCommandRunner.setTermFontSize(newFontSize, false);
        commandRtnHandler(prtn, mobx.observable.box(errorMessage));
    }, [errorMessage]);

    const handleChangeFontFamily = React.useCallback((fontFamily: string) => {
        if (GlobalModel.getTermFontFamily() === fontFamily) {
            return;
        }
        const prtn = GlobalCommandRunner.setTermFontFamily(fontFamily, false);
        commandRtnHandler(prtn, mobx.observable.box(errorMessage));
    }, [errorMessage]);

    const handleChangeThemeSource = React.useCallback((themeSource: NativeThemeSource) => {
        if (GlobalModel.getThemeSource() === themeSource) {
            return;
        }
        const prtn = GlobalCommandRunner.setTheme(themeSource, false);
        GlobalModel.getElectronApi().setNativeThemeSource(themeSource);
        commandRtnHandler(prtn, mobx.observable.box(errorMessage));
    }, [errorMessage]);

    const handleChangeTermTheme = React.useCallback((theme: string) => {
        const currTheme = GlobalModel.getTermThemeSettings()["root"];
        if (currTheme === theme) {
            return;
        }
        const prtn = GlobalCommandRunner.setRootTermTheme(theme, false);
        commandRtnHandler(prtn, mobx.observable.box(errorMessage));
    }, [errorMessage]);

    const handleChangeReleaseCheck = React.useCallback((val: boolean) => {
        let prtn: Promise<CommandRtnType> = null;
        if (val) {
            prtn = GlobalCommandRunner.releaseCheckAutoOn(false);
        } else {
            prtn = GlobalCommandRunner.releaseCheckAutoOff(false);
        }
        commandRtnHandler(prtn, mobx.observable.box(errorMessage));
        GlobalModel.getElectronApi().changeAutoUpdate(val);
    }, [errorMessage]);

    const handleChangeAutocompleteEnabled = React.useCallback((val: boolean) => {
        const prtn: Promise<CommandRtnType> = GlobalCommandRunner.setAutocompleteEnabled(val);
        commandRtnHandler(prtn, mobx.observable.box(errorMessage));
    }, [errorMessage]);

    const handleChangeAutocompleteDebuggingEnabled = React.useCallback((val: boolean) => {
        mobx.action(() => {
            GlobalModel.autocompleteModel.loggingEnabled = val;
        })();
    }, []);

    const getFontSizes = React.useCallback((): DropdownItem[] => {
        const availableFontSizes: DropdownItem[] = [];
        for (let s = appconst.MinFontSize; s <= appconst.MaxFontSize; s++) {
            availableFontSizes.push({ label: s + "px", value: String(s) });
        }
        return availableFontSizes;
    }, []);

    const getFontFamilies = React.useCallback((): DropdownItem[] => {
        const availableFontFamilies: DropdownItem[] = [];
        availableFontFamilies.push({ label: "JetBrains Mono", value: "JetBrains Mono" });
        availableFontFamilies.push({ label: "Hack", value: "Hack" });
        availableFontFamilies.push({ label: "Fira Code", value: "Fira Code" });
        return availableFontFamilies;
    }, []);

    const getThemeSources = React.useCallback((): DropdownItem[] => {
        const themeSources: DropdownItem[] = [];
        themeSources.push({ label: "Dark", value: "dark" });
        themeSources.push({ label: "Light", value: "light" });
        themeSources.push({ label: "System", value: "system" });
        return themeSources;
    }, []);

    const handleChangeShortcut = React.useCallback((newShortcut: string) => {
        const prtn = GlobalCommandRunner.setGlobalShortcut(newShortcut);
        commandRtnHandler(prtn, mobx.observable.box(errorMessage));
    }, [errorMessage]);

    const getLayoutOrderOptions = React.useCallback((): DropdownItem[] => {
        const layoutOrderOptions: DropdownItem[] = [];
        layoutOrderOptions.push({ label: "Top", value: "top" });
        layoutOrderOptions.push({ label: "Bottom", value: "bottom" });
        return layoutOrderOptions;
    }, []);

    const getFKeys = React.useCallback((): DropdownItem[] => {
        const opts: DropdownItem[] = [];
        opts.push({ label: "Disabled", value: "" });
        const platform = GlobalModel.getPlatform();
        for (let i = 1; i <= 12; i++) {
            const shortcut = (platform === "darwin" ? "Cmd" : "Alt") + "+F" + String(i);
            opts.push({ label: shortcut, value: shortcut });
        }
        return opts;
    }, []);

    const getCurrentShortcut = React.useCallback((): string => {
        const clientData = GlobalModel.clientData.get();
        return clientData?.clientopts?.globalshortcut ?? "";
    }, []);

    const handleClose = React.useCallback(() => {
        GlobalModel.clientSettingsViewModel.closeView();
    }, []);

    const handleChangeInputPosition = React.useCallback((position: string) => {
        const prtn = GlobalCommandRunner.setInputPosition(position);
        commandRtnHandler(prtn, mobx.observable.box(errorMessage));
    }, [errorMessage]);

    const getSudoPwStoreOptions = React.useCallback((): DropdownItem[] => {
        const sudoCacheSources: DropdownItem[] = [];
        sudoCacheSources.push({ label: "On", value: "on" });
        sudoCacheSources.push({ label: "Off", value: "off" });
        sudoCacheSources.push({ label: "On Without Timeout", value: "notimeout" });
        return sudoCacheSources;
    }, []);

    const handleChangeSudoPwStoreConfig = React.useCallback((store: string) => {
        const prtn = GlobalCommandRunner.setSudoPwStore(store);
        commandRtnHandler(prtn, mobx.observable.box(errorMessage));
    }, [errorMessage]);

    const handleChangeSudoPwTimeoutConfig = React.useCallback((timeout: string) => {
        if (Number(timeout) !== 0) {
            const prtn = GlobalCommandRunner.setSudoPwTimeout(timeout);
            commandRtnHandler(prtn, mobx.observable.box(errorMessage));
        }
    }, [errorMessage]);

    const handleChangeSudoPwClearOnSleepConfig = React.useCallback((clearOnSleep: boolean) => {
        const prtn = GlobalCommandRunner.setSudoPwClearOnSleep(clearOnSleep);
        commandRtnHandler(prtn, mobx.observable.box(errorMessage));
    }, [errorMessage]);

    const isHidden = GlobalModel.activeMainView.get() !== "clientsettings";
    if (isHidden) {
        return null;
    }

    const cdata: ClientDataType = GlobalModel.clientData.get();
    const curFontSize = GlobalModel.getTermFontSize();
    const curFontFamily = GlobalModel.getTermFontFamily();
    const curTheme = GlobalModel.getThemeSource();
    const termThemes = getTermThemes(GlobalModel.termThemes.get(), "Wave Default");
    const currTermTheme = GlobalModel.getTermThemeSettings()["root"] ?? termThemes[0].label;
    const curSudoPwStore = GlobalModel.getSudoPwStore();
    const curSudoPwTimeout = String(GlobalModel.getSudoPwTimeout());
    const curSudoPwClearOnSleep = GlobalModel.getSudoPwClearOnSleep();

    return (
        <MainView
            className="clientsettings-view"
            title="Client Settings"
            onClose={handleClose}
            scrollable={true}
        >
            {!isHidden && <ClientSettingsKeybindings />}
            <div className="content">
                <div className="settings-field">
                    <div className="settings-label">Term Font Size</div>
                    <div className="settings-input">
                        <Dropdown
                            className="font-size-dropdown"
                            options={getFontSizes()}
                            defaultValue={`${curFontSize}px`}
                            onChange={handleChangeFontSize}
                        />
                    </div>
                </div>
                <div className="settings-field">
                    <div className="settings-label">Term Font Family</div>
                    <div className="settings-input">
                        <Dropdown
                            className="font-size-dropdown"
                            options={getFontFamilies()}
                            defaultValue={curFontFamily}
                            onChange={handleChangeFontFamily}
                        />
                    </div>
                </div>
                <div className="settings-field">
                    <div className="settings-label">Theme</div>
                    <div className="settings-input">
                        <Dropdown
                            className="theme-dropdown"
                            options={getThemeSources()}
                            defaultValue={curTheme}
                            onChange={handleChangeThemeSource}
                        />
                    </div>
                </div>
                {termThemes.length > 0 && (
                    <div className="settings-field">
                        <div className="settings-label">Terminal Theme</div>
                        <div className="settings-input">
                            <Dropdown
                                className="terminal-theme-dropdown"
                                options={termThemes}
                                defaultValue={currTermTheme}
                                onChange={handleChangeTermTheme}
                            />
                        </div>
                    </div>
                )}
                <div className="settings-field">
                    <div className="settings-label">Client ID</div>
                    <div className="settings-input">{cdata.clientid}</div>
                </div>
                <div className="settings-field">
                    <div className="settings-label">Client Version</div>
                    <div className="settings-input">
                        {appconst.VERSION} {appconst.BUILD}
                    </div>
                </div>
                <div className="settings-field">
                    <div className="settings-label">DB Version</div>
                    <div className="settings-input">{cdata.dbversion}</div>
                </div>
                <div className="settings-field">
                    <div className="settings-label">Check for Updates</div>
                    <div className="settings-input">
                        <Toggle
                            checked={!cdata.clientopts.noreleasecheck}
                            onChange={handleChangeReleaseCheck}
                        />
                    </div>
                </div>
                <AiProviders />
                <div className="settings-field">
                    <div className="settings-label">Global Hotkey</div>
                    <div className="settings-input">
                        <Dropdown
                            className="hotkey-dropdown"
                            options={getFKeys()}
                            defaultValue={getCurrentShortcut()}
                            onChange={handleChangeShortcut}
                        />
                    </div>
                </div>
                <div className="settings-field">
                    <div className="settings-label">Input Position</div>
                    <div className="settings-input">
                        <Dropdown
                            className="layout-order-dropdown"
                            options={getLayoutOrderOptions()}
                            defaultValue={GlobalModel.inputPosition.get()}
                            onChange={handleChangeInputPosition}
                        />
                    </div>
                </div>
                <div className="settings-field">
                    <div className="settings-label">Remember Sudo Password</div>
                    <div className="settings-input">
                        <Dropdown
                            className="hotkey-dropdown"
                            options={getSudoPwStoreOptions()}
                            defaultValue={curSudoPwStore}
                            onChange={handleChangeSudoPwStoreConfig}
                        />
                    </div>
                </div>
                <div className="settings-field">
                    <div className="settings-label">Sudo Timeout (Minutes)</div>
                    <div className="settings-input">
                        <InlineSettingsTextEdit
                            placeholder=""
                            text={curSudoPwTimeout}
                            value={curSudoPwTimeout}
                            onChange={handleChangeSudoPwTimeoutConfig}
                            maxLength={6}
                            showIcon={true}
                            isNumber={true}
                        />
                    </div>
                </div>
                <div className="settings-field">
                    <div className="settings-label">Clear Sudo Password on Sleep</div>
                    <div className="settings-input">
                        <Toggle
                            checked={curSudoPwClearOnSleep}
                            onChange={handleChangeSudoPwClearOnSleepConfig}
                        />
                    </div>
                </div>
                <div className="settings-field">
                    <div className="settings-label">Command Autocomplete</div>
                    <div className="settings-input">
                        <Toggle
                            checked={cdata.clientopts.autocompleteenabled ?? false}
                            onChange={handleChangeAutocompleteEnabled}
                        />
                    </div>
                </div>
                <div className="settings-field">
                    <div className="settings-label">Command Autocomplete Debugging</div>
                    <div className="settings-input">
                        <Toggle
                            checked={GlobalModel.autocompleteModel.loggingEnabled}
                            onChange={handleChangeAutocompleteDebuggingEnabled}
                        />
                    </div>
                </div>
                <SettingsError errorMessage={mobx.observable.box(errorMessage)} />
            </div>
        </MainView>
    );
});

export { ClientSettingsView };