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
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { commandRtnHandler, isBlank } from "@/utils/util";
import { getTermThemes } from "@/utils/themeutil";
import * as appconst from "@/appconst";
import { MainView } from "@/components/ui/mainview";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";

import { AiProviders } from "./aiproviders";
import { SettingItem } from "./settingItem";

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
        opts.push({ label: "Disabled", value: " " });
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
                title="Client Settings"
                separator={true}
                scrollable={true}
            >
                <>
                    <If condition={!isHidden}>
                        <ClientSettingsKeybindings></ClientSettingsKeybindings>
                    </If>
                    <div className="grid grid-cols-1 gap-4 p-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="pt-4">Appearance</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-2 flex justify-center">
                                <div>
                                    {/* <SettingItem title="Theme" description="Select the application theme.">
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
                                </SettingItem> */}
                                {/* <If condition={termThemes.length > 0}>
                                    <SettingItem title="Terminal Theme" description="Select the terminal theme.">
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
                                    </SettingItem>
                                </If> */}
                                <SettingItem title="Terminal Font Size" description="Select the font size for the terminal.">
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
                                </SettingItem>
                                <SettingItem title="Terminal Font Family" description="Select the font family for the terminal.">
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
                                </SettingItem>
                                <SettingItem title="Input Position" description="Select the position of the command input.">
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
                                </SettingItem>
                                </div>
                            </CardContent>
                        </Card>
                        {/* <Card>
                            <CardHeader>
                                <CardTitle className="pt-4">Security</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-2">
                                <SettingItem title="Remember Sudo Password" description="Configure how sudo password is cached.">
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
                                </SettingItem>
                                <SettingItem title="Sudo Timeout (Minutes)" description="Set the timeout for cached sudo password.">
                                    <InlineSettingsTextEdit
                                        placeholder=""
                                        text={curSudoPwTimeout}
                                        value={curSudoPwTimeout}
                                        onChange={this.handleChangeSudoPwTimeoutConfig}
                                        maxLength={6}
                                        showIcon={true}
                                        isNumber={true}
                                    />
                                </SettingItem>
                                <SettingItem title="Clear Sudo Password on Sleep" description="Clear cached sudo password when the system sleeps.">
                                    <Toggle
                                        checked={curSudoPwClearOnSleep}
                                        onCheckedChange={this.handleChangeSudoPwClearOnSleepConfig}
                                    />
                                </SettingItem>
                            </CardContent>
                        </Card> */}
                        <Card className="col-span-2">
                            <CardHeader>
                                <CardTitle className="pt-4">AI</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-2">
                                <AiProviders />
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle className="pt-4">Advanced</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-2 flex justify-center">
                                <div>
                                    <SettingItem title="Command Autocomplete" description="Enable or disable command autocomplete.">
                                    <Toggle
                                        checked={cdata.clientopts.autocompleteenabled ?? false}
                                        onCheckedChange={this.handleChangeAutocompleteEnabled}
                                    />
                                </SettingItem>
                                <SettingItem title="Command Autocomplete Debugging" description="Enable or disable debugging for command autocomplete.">
                                    <Toggle
                                        checked={GlobalModel.autocompleteModel.loggingEnabled}
                                        onCheckedChange={this.handleChangeAutocompleteDebuggingEnabled}
                                    />
                                </SettingItem>
                                <SettingItem title="Global Hotkey" description="Set a global hotkey to show/hide the application.">
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
                                </SettingItem>
                                <SettingItem title="Check for Updates" description="Automatically check for new releases.">
                                    <Toggle
                                        checked={!cdata.clientopts.noreleasecheck}
                                        onCheckedChange={this.handleChangeReleaseCheck}
                                    />
                                </SettingItem>
                                </div>
                            </CardContent>
                        </Card>
                        {/* <Card>
                            <CardHeader>
                                <CardTitle className="pt-4">About</CardTitle>
                            </CardHeader>
                            <CardContent className="pt-2">
                                <SettingItem title="Client ID" description="Your unique client identifier.">
                                    <div className="flex flex-row items-center">{cdata.clientid}</div>
                                </SettingItem>
                                <SettingItem title="Client Version" description="The current version of the application.">
                                    <div className="flex flex-row items-center">
                                        {appconst.VERSION} {appconst.BUILD}
                                    </div>
                                </SettingItem>
                                <SettingItem title="DB Version" description="The current version of the database schema.">
                                    <div className="flex flex-row items-center">{cdata.dbversion}</div>
                                </SettingItem>
                            </CardContent>
                        </Card> */}
                        <SettingsError errorMessage={this.errorMessage.get()} onDismiss={this.dismissError} />
                    </div>
                </>
            </MainView>
        );
    }
}

export { ClientSettingsView };