// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import * as mobxReact from "mobx-react";
import * as mobx from "mobx";
import { boundMethod } from "autobind-decorator";
import { If } from "tsx-control-statements/components";
import { GlobalModel, GlobalCommandRunner } from "@/models/global";
import { RemotesModel } from "@/models/remotes";
import { Switch as Toggle } from "@/components/ui/toggle";
import { InlineSettingsTextEdit } from "@/components/ui/inlinesettingstextedit";
import { SettingsError } from "@/components/ui/settingserror";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { commandRtnHandler, isBlank } from "@/utils/util";
import { getTermThemes } from "@/utils/themeutil";
import * as appconst from "@/appconst";
import { MainView } from "@/components/ui/mainview";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";

import { AiProviders } from "./aiproviders";

class ClientSettingsKeybindings extends React.Component<{}, {}> {
    componentDidMount() {
        let clientSettingsViewModel = GlobalModel.clientSettingsViewModel;
        let keybindManager = GlobalModel.keybindManager;
        keybindManager.registerKeybinding("mainview", "clientsettings", "generic:cancel", (waveEvent) => {
            clientSettingsViewModel.closeView();
            return true;
        });
    }

    componentWillUnmount() {
        GlobalModel.keybindManager.unregisterDomain("clientsettings");
    }

    render() {
        return null;
    }
}

@mobxReact.observer
class ClientSettingsView extends React.Component<{ model: RemotesModel }, { hoveredItemId: string }> {
    errorMessage: OV<string> = mobx.observable.box(null, { name: "ClientSettings-errorMessage" });

    @boundMethod
    dismissError(): void {
        mobx.action(() => {
            this.errorMessage.set(null);
        })();
    }

    @boundMethod
    handleChangeFontSize(fontSize: string): void {
        const newFontSize = Number(fontSize);
        if (GlobalModel.getTermFontSize() == newFontSize) {
            return;
        }
        const prtn = GlobalCommandRunner.setTermFontSize(newFontSize, false);
        commandRtnHandler(prtn, this.errorMessage);
    }

    @boundMethod
    handleChangeFontFamily(fontFamily: string): void {
        if (GlobalModel.getTermFontFamily() == fontFamily) {
            return;
        }
        const prtn = GlobalCommandRunner.setTermFontFamily(fontFamily, false);
        commandRtnHandler(prtn, this.errorMessage);
    }

    @boundMethod
    handleChangeThemeSource(themeSource: NativeThemeSource): void {
        if (GlobalModel.getThemeSource() == themeSource) {
            return;
        }
        const prtn = GlobalCommandRunner.setTheme(themeSource, false);
        GlobalModel.getElectronApi().setNativeThemeSource(themeSource);
        commandRtnHandler(prtn, this.errorMessage);
    }

    @boundMethod
    handleChangeTermTheme(theme: string): void {
        // For root terminal theme, the key is root, otherwise it's either
        // sessionId or screenId.
        const currTheme = GlobalModel.getTermThemeSettings()["root"];
        if (currTheme == theme) {
            return;
        }
        const prtn = GlobalCommandRunner.setRootTermTheme(theme, false);
        commandRtnHandler(prtn, this.errorMessage);
    }

    // @boundMethod
    // handleChangeTelemetry(val: boolean): void {
    //     let prtn: Promise<CommandRtnType> = null;
    //     if (val) {
    //         prtn = GlobalCommandRunner.telemetryOn(false);
    //     } else {
    //         prtn = GlobalCommandRunner.telemetryOff(false);
    //     }
    //     commandRtnHandler(prtn, this.errorMessage);
    // }

    @boundMethod
    handleChangeReleaseCheck(val: boolean): void {
        let prtn: Promise<CommandRtnType> = null;
        if (val) {
            prtn = GlobalCommandRunner.releaseCheckAutoOn(false);
        } else {
            prtn = GlobalCommandRunner.releaseCheckAutoOff(false);
        }
        commandRtnHandler(prtn, this.errorMessage);
        GlobalModel.getElectronApi().changeAutoUpdate(val);
    }

    @boundMethod
    handleChangeAutocompleteEnabled(val: boolean): void {
        const prtn: Promise<CommandRtnType> = GlobalCommandRunner.setAutocompleteEnabled(val);
        commandRtnHandler(prtn, this.errorMessage);
    }

    @boundMethod
    handleChangeAutocompleteDebuggingEnabled(val: boolean): void {
        mobx.action(() => {
            GlobalModel.autocompleteModel.loggingEnabled = val;
        })();
    }

    getFontSizes(): DropdownItem[] {
        const availableFontSizes: DropdownItem[] = [];
        for (let s = appconst.MinFontSize; s <= appconst.MaxFontSize; s++) {
            availableFontSizes.push({ label: s + "px", value: String(s) });
        }
        return availableFontSizes;
    }

    getFontFamilies(): DropdownItem[] {
        const availableFontFamilies: DropdownItem[] = [];
        availableFontFamilies.push({ label: "JetBrains Mono", value: "JetBrains Mono" });
        availableFontFamilies.push({ label: "Hack", value: "Hack" });
        availableFontFamilies.push({ label: "Fira Code", value: "Fira Code" });
        return availableFontFamilies;
    }

    getThemeSources(): DropdownItem[] {
        const themeSources: DropdownItem[] = [];
        themeSources.push({ label: "Dark", value: "dark" });
        themeSources.push({ label: "Light", value: "light" });
        themeSources.push({ label: "System", value: "system" });
        return themeSources;
    }


    @boundMethod
    setErrorMessage(msg: string): void {
        mobx.action(() => {
            this.errorMessage.set(msg);
        })();
    }

    @boundMethod
    handleChangeShortcut(newShortcut: string): void {
        const prtn = GlobalCommandRunner.setGlobalShortcut(newShortcut);
        commandRtnHandler(prtn, this.errorMessage);
    }

    getLayoutOrderOptions(): DropdownItem[] {
        const layoutOrderOptions: DropdownItem[] = [];
        layoutOrderOptions.push({ label: "Top", value: "top" });
        layoutOrderOptions.push({ label: "Bottom", value: "bottom" });
        return layoutOrderOptions;
    }

    getFKeys(): DropdownItem[] {
        const opts: DropdownItem[] = [];
        opts.push({ label: "Disabled", value: "" });
        const platform = GlobalModel.getPlatform();
        for (let i = 1; i <= 12; i++) {
            const shortcut = (platform == "darwin" ? "Cmd" : "Alt") + "+F" + String(i);
            opts.push({ label: shortcut, value: shortcut });
        }
        return opts;
    }

    getCurrentShortcut(): string {
        const clientData = GlobalModel.clientData.get();
        return clientData?.clientopts?.globalshortcut ?? "";
    }

    @boundMethod
    handleClose() {
        GlobalModel.clientSettingsViewModel.closeView();
    }

    @boundMethod
    handleChangeInputPosition(position: string): void {
        const prtn = GlobalCommandRunner.setInputPosition(position);
        commandRtnHandler(prtn, this.errorMessage);
    }

    getSudoPwStoreOptions(): DropdownItem[] {
        const sudoCacheSources: DropdownItem[] = [];
        sudoCacheSources.push({ label: "On", value: "on" });
        sudoCacheSources.push({ label: "Off", value: "off" });
        sudoCacheSources.push({ label: "On Without Timeout", value: "notimeout" });
        return sudoCacheSources;
    }

    @boundMethod
    handleChangeSudoPwStoreConfig(store: string) {
        const prtn = GlobalCommandRunner.setSudoPwStore(store);
        commandRtnHandler(prtn, this.errorMessage);
    }

    @boundMethod
    handleChangeSudoPwTimeoutConfig(timeout: string) {
        if (Number(timeout) != 0) {
            const prtn = GlobalCommandRunner.setSudoPwTimeout(timeout);
            commandRtnHandler(prtn, this.errorMessage);
        }
    }

    @boundMethod
    handleChangeSudoPwClearOnSleepConfig(clearOnSleep: boolean) {
        const prtn = GlobalCommandRunner.setSudoPwClearOnSleep(clearOnSleep);
        commandRtnHandler(prtn, this.errorMessage);
    }

    render() {
        const isHidden = GlobalModel.activeMainView.get() != "clientsettings";
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
                onClose={this.handleClose}
                scrollable={true}
            >
                <If condition={!isHidden}>
                    <ClientSettingsKeybindings></ClientSettingsKeybindings>
                </If>
                <div className="px-[30px] py-[14px] pr-[18px] overflow-y-scroll">
                    <div className="flex flex-row items-center">
                        <div className="font-bold w-[250px] flex flex-row items-center mr-[10px]">Term Font Size</div>
                        <div className="flex flex-row items-center">
                            <Select onValueChange={this.handleChangeFontSize} defaultValue={`${curFontSize}`}>
                                <SelectTrigger className="w-[200px]">
                                    <SelectValue placeholder="Select font size" />
                                </SelectTrigger>
                                <SelectContent>
                                    {this.getFontSizes().map((size) => (
                                        <SelectItem key={size.value} value={size.value}>
                                            {size.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex flex-row items-center mt-[10px]">
                        <div className="font-bold w-[250px] flex flex-row items-center mr-[10px]">Term Font Family</div>
                        <div className="flex flex-row items-center">
                            <Select onValueChange={this.handleChangeFontFamily} defaultValue={curFontFamily}>
                                <SelectTrigger className="w-[200px]">
                                    <SelectValue placeholder="Select font family" />
                                </SelectTrigger>
                                <SelectContent>
                                    {this.getFontFamilies().map((font) => (
                                        <SelectItem key={font.value} value={font.value}>
                                            {font.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex flex-row items-center mt-[10px]">
                        <div className="font-bold w-[250px] flex flex-row items-center mr-[10px]">Theme</div>
                        <div className="flex flex-row items-center">
                            <Select onValueChange={this.handleChangeThemeSource} defaultValue={curTheme}>
                                <SelectTrigger className="w-[200px]">
                                    <SelectValue placeholder="Select theme" />
                                </SelectTrigger>
                                <SelectContent>
                                    {this.getThemeSources().map((theme) => (
                                        <SelectItem key={theme.value} value={theme.value}>
                                            {theme.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <If condition={termThemes.length > 0}>
                        <div className="flex flex-row items-center mt-[10px]">
                            <div className="font-bold w-[250px] flex flex-row items-center mr-[10px]">Terminal Theme</div>
                            <div className="flex flex-row items-center">
                                <Select onValueChange={this.handleChangeTermTheme} defaultValue={currTermTheme}>
                                    <SelectTrigger className="w-[200px]">
                                        <SelectValue placeholder="Select terminal theme" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {termThemes.map((theme) => (
                                            <SelectItem key={theme.value} value={theme.value}>
                                                {theme.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </If>
                    <div className="flex flex-row items-center mt-[10px]">
                        <div className="font-bold w-[250px] flex flex-row items-center mr-[10px]">Client ID</div>
                        <div className="flex flex-row items-center">{cdata.clientid}</div>
                    </div>
                    <div className="flex flex-row items-center mt-[10px]">
                        <div className="font-bold w-[250px] flex flex-row items-center mr-[10px]">Client Version</div>
                        <div className="flex flex-row items-center">
                            {appconst.VERSION} {appconst.BUILD}
                        </div>
                    </div>
                    <div className="flex flex-row items-center mt-[10px]">
                        <div className="font-bold w-[250px] flex flex-row items-center mr-[10px]">DB Version</div>
                        <div className="flex flex-row items-center">{cdata.dbversion}</div>
                    </div>
                    {/* <div className="flex flex-row items-center mt-[10px]">
                        <div className="font-bold w-[250px] flex flex-row items-center mr-[10px]">Basic Telemetry</div>
                        <div className="flex flex-row items-center">
                            <Toggle checked={!cdata.clientopts.notelemetry} onChange={this.handleChangeTelemetry} />
                        </div>
                    </div> */}
                    <div className="flex flex-row items-center mt-[10px]">
                        <div className="font-bold w-[250px] flex flex-row items-center mr-[10px]">Check for Updates</div>
                        <div className="flex flex-row items-center">
                            <Toggle
                                checked={!cdata.clientopts.noreleasecheck}
                                onCheckedChange={this.handleChangeReleaseCheck}
                            />
                        </div>
                    </div>
                    <AiProviders />

                    <div className="flex flex-row items-center mt-[10px]">
                        <div className="font-bold w-[250px] flex flex-row items-center mr-[10px]">Global Hotkey</div>
                        <div className="flex flex-row items-center">
                            <Select onValueChange={this.handleChangeShortcut} defaultValue={this.getCurrentShortcut()}>
                                <SelectTrigger className="w-[200px]">
                                    <SelectValue placeholder="Select hotkey" />
                                </SelectTrigger>
                                <SelectContent>
                                    {this.getFKeys().map((key) => (
                                        <SelectItem key={key.value} value={key.value}>
                                            {key.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex flex-row items-center mt-[10px]">
                        <div className="font-bold w-[250px] flex flex-row items-center mr-[10px]">Input Position</div>
                        <div className="flex flex-row items-center">
                            <Select
                                onValueChange={this.handleChangeInputPosition}
                                defaultValue={GlobalModel.inputPosition.get()}
                            >
                                <SelectTrigger className="w-[200px]">
                                    <SelectValue placeholder="Select position" />
                                </SelectTrigger>
                                <SelectContent>
                                    {this.getLayoutOrderOptions().map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex flex-row items-center mt-[10px]">
                        <div className="font-bold w-[250px] flex flex-row items-center mr-[10px]">Remember Sudo Password</div>
                        <div className="flex flex-row items-center">
                            <Select onValueChange={this.handleChangeSudoPwStoreConfig} defaultValue={curSudoPwStore}>
                                <SelectTrigger className="w-[200px]">
                                    <SelectValue placeholder="Select option" />
                                </SelectTrigger>
                                <SelectContent>
                                    {this.getSudoPwStoreOptions().map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex flex-row items-center mt-[10px]">
                        <div className="font-bold w-[250px] flex flex-row items-center mr-[10px]">Sudo Timeout (Minutes)</div>
                        <div className="flex flex-row items-center">
                            <InlineSettingsTextEdit
                                placeholder=""
                                text={curSudoPwTimeout}
                                value={curSudoPwTimeout}
                                onChange={this.handleChangeSudoPwTimeoutConfig}
                                maxLength={6}
                                showIcon={true}
                                isNumber={true}
                            />
                        </div>
                    </div>
                    <div className="flex flex-row items-center mt-[10px]">
                        <div className="font-bold w-[250px] flex flex-row items-center mr-[10px]">Clear Sudo Password on Sleep</div>
                        <div className="flex flex-row items-center">
                            <Toggle
                                checked={curSudoPwClearOnSleep}
                                onCheckedChange={this.handleChangeSudoPwClearOnSleepConfig}
                            />
                        </div>
                    </div>
                    <div className="flex flex-row items-center mt-[10px]">
                        <div className="font-bold w-[250px] flex flex-row items-center mr-[10px]">Command Autocomplete</div>
                        <div className="flex flex-row items-center">
                            <Toggle
                                checked={cdata.clientopts.autocompleteenabled ?? false}
                                onCheckedChange={this.handleChangeAutocompleteEnabled}
                            />
                        </div>
                    </div>
                    <div className="flex flex-row items-center mt-[10px]">
                        <div className="font-bold w-[250px] flex flex-row items-center mr-[10px]">Command Autocomplete Debugging</div>
                        <div className="flex flex-row items-center">
                            <Toggle
                                checked={GlobalModel.autocompleteModel.loggingEnabled}
                                onCheckedChange={this.handleChangeAutocompleteDebuggingEnabled}
                            />
                        </div>
                    </div>
                    <SettingsError errorMessage={this.errorMessage.get()} onDismiss={this.dismissError} />
                </div>
            </MainView>
        );
    }
}

export { ClientSettingsView };