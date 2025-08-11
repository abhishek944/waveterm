// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { observer } from "mobx-react";
import { clsx } from "clsx";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import { If } from "tsx-control-statements/components";
import { GlobalModel, GlobalCommandRunner } from "@/models";
import { CmdInput } from "@/components/workspace";
import { ScreenView } from "@/components/workspace";
import { ScreenTabs } from "@/components/workspace";
import { ErrorBoundary } from "@/components/error/errorboundary";
import { commandRtnHandler } from "@/utils/util";
import { getTermThemes } from "@/utils/themeutil";
import { TabColorSelector, TabIconSelector, TabNameTextField, TabRemoteSelector } from "@/components/workspace";
import * as util from "@/utils/util";
import { getRemoteStrWithAlias } from "@/components/prompt/prompt";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem } from "@/components/ui/select";

dayjs.extend(localizedFormat);

const ScreenDeleteMessage = `
Are you sure you want to delete this tab?
`.trim();

const SessionKeybindings: React.FC = () => {
    React.useEffect(() => {
        const keybindManager = GlobalModel.keybindManager;
        keybindManager.registerKeybinding("mainview", "session", "app:toggleSidebar", (waveEvent) => {
            GlobalModel.handleToggleSidebar();
            return true;
        });
        keybindManager.registerKeybinding("mainview", "session", "app:newTab", (waveEvent) => {
            GlobalModel.onNewTab();
            return true;
        });
        keybindManager.registerKeybinding("mainview", "session", "app:closeCurrentTab", (waveEvent) => {
            GlobalModel.onCloseCurrentTab();
            return true;
        });
        for (let index = 1; index <= 9; index++) {
            keybindManager.registerKeybinding("mainview", "session", "app:selectTab-" + index, (waveEvent) => {
                GlobalModel.onSwitchScreenCmd(index);
                return true;
            });
        }
        keybindManager.registerKeybinding("mainview", "session", "app:selectTabLeft", (waveEvent) => {
            GlobalModel.onBracketCmd(-1);
            return true;
        });
        keybindManager.registerKeybinding("mainview", "session", "app:selectTabRight", (waveEvent) => {
            GlobalModel.onBracketCmd(1);
            return true;
        });
        keybindManager.registerKeybinding("pane", "screen", "app:selectLineAbove", (waveEvent) => {
            GlobalModel.onMetaArrowUp();
            return true;
        });
        keybindManager.registerKeybinding("pane", "screen", "app:selectLineBelow", (waveEvent) => {
            GlobalModel.onMetaArrowDown();
            return true;
        });
        keybindManager.registerKeybinding("pane", "screen", "app:restartCommand", (waveEvent) => {
            GlobalModel.onRestartCommand();
            return true;
        });
        keybindManager.registerKeybinding("pane", "screen", "app:restartLastCommand", (waveEvent) => {
            GlobalModel.onRestartLastCommand();
            return true;
        });
        keybindManager.registerKeybinding("pane", "screen", "app:focusSelectedLine", (waveEvent) => {
            GlobalModel.onFocusSelectedLine();
            return true;
        });
        keybindManager.registerKeybinding("pane", "screen", "app:deleteActiveLine", (waveEvent) => {
            return GlobalModel.handleDeleteActiveLine();
        });
        keybindManager.registerKeybinding("pane", "screen", "app:copy", (waveEvent) => {
            GlobalModel.copySelectedBlock();
            return true;
        });

        return () => {
            keybindManager.unregisterDomain("session");
            keybindManager.unregisterDomain("screen");
        };
    }, []);

    return null;
};

const TabSettingsPulldownKeybindings: React.FC = observer(() => {
    React.useEffect(() => {
        const keybindManager = GlobalModel.keybindManager;
        keybindManager.registerKeybinding("pane", "tabsettings", "generic:cancel", (waveEvent) => {
            GlobalModel.closeTabSettings();
            return true;
        });

        return () => {
            keybindManager.unregisterDomain("tabsettings");
        };
    }, []);

    return null;
});

const TabSettings: React.FC = observer(() => {
    const errorMessage = React.useState<string | null>(null);
    const activeScreen = GlobalModel.getActiveSession().getActiveScreen();

    const handleDeleteScreen = () => {
        if (activeScreen == null) {
            return;
        }
        let numLines = activeScreen.getScreenLines().lines.length;
        if (numLines < 10) {
            GlobalCommandRunner.screenDelete(activeScreen.screenId, false);
            GlobalModel.modalsModel.popModal();
            return;
        }
        const message = ScreenDeleteMessage;
        const alertRtn = GlobalModel.showAlert({ message: message, confirm: true, markdown: true });
        alertRtn.then((result) => {
            if (!result) {
                return;
            }
            const prtn = GlobalCommandRunner.screenDelete(activeScreen.screenId, false);
            util.commandRtnHandler(prtn, errorMessage);
            GlobalModel.modalsModel.popModal();
        });
    };

    const handleChangeTermTheme = (theme: string) => {
        const { screenId } = activeScreen;
        const currTheme = GlobalModel.getTermThemeSettings()[screenId];
        if (currTheme == theme) {
            return;
        }
        const prtn = GlobalCommandRunner.setScreenTermTheme(screenId, theme, false);
        commandRtnHandler(prtn, errorMessage);
    };

    const rptr = activeScreen.curRemote.get();
    const termThemes = getTermThemes(GlobalModel.termThemes.get());
    const currTermTheme = GlobalModel.getTermThemeSettings()[activeScreen.screenId] ?? termThemes[0]?.label;

    return (
        <div className="m-2 mx-4">
            <div className="flex flex-col items-start gap-2 self-stretch py-2.5 px-4">
                <TabNameTextField screen={activeScreen} errorMessage={errorMessage} />
            </div>
            <div className="h-px bg-gray-700" />
            <div className="flex flex-col items-start gap-2 self-stretch py-2.5 px-4">
                <div className="truncate select-none">
                    You're connected to "{getRemoteStrWithAlias(rptr)}". Do you want to change it?
                </div>
                <div>
                    <TabRemoteSelector screen={activeScreen} errorMessage={errorMessage} />
                </div>
                <div className="text-sm text-gray-400 ml-1.5 truncate">
                    To change connection from the command line use `cr [alias|user@host]`
                </div>
            </div>
            <div className="h-px bg-gray-700" />
            <If condition={termThemes.length > 0}>
                <div className="py-2.5 px-4">
                    <Select onValueChange={handleChangeTermTheme} defaultValue={currTermTheme}>
                        <SelectTrigger className="w-[412px]">{currTermTheme}</SelectTrigger>
                        <SelectContent>
                            {termThemes.map((theme) => (
                                <SelectItem key={theme.value} value={theme.value}>
                                    {theme.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </If>
            <div className="h-px bg-gray-700" />
            <div className="py-2.5 px-4">
                <TabIconSelector screen={activeScreen} errorMessage={errorMessage} />
            </div>
            <div className="h-px bg-gray-700" />
            <div className="py-2.5 px-4">
                <TabColorSelector screen={activeScreen} errorMessage={errorMessage} />
            </div>
            <div className="h-px bg-gray-700" />
            <div className="py-2.5 px-4">
                <Button onClick={handleDeleteScreen} className="py-1 bg-primary text-primary-foreground border border-gray-500 text-gray-400 hover:bg-destructive hover:text-destructive-foreground">
                    Delete Tab
                </Button>
            </div>
        </div>
    );
});

export const WorkspaceView: React.FC = observer(() => {
    const sessionRef = React.useRef<HTMLDivElement>(null);

    const toggleTabSettings = () => {
        GlobalModel.tabSettingsOpen.set(!GlobalModel.tabSettingsOpen.get());
    };

    const session = GlobalModel.getActiveSession();
    let activeScreen: any | null = null;
    let sessionId: string = "none";
    if (session != null) {
        sessionId = session.sessionId;
        activeScreen = session.getActiveScreen();
    }
    const isHidden = GlobalModel.activeMainView.get() != "session";
    const mainSidebarModel = GlobalModel.mainSidebarModel;
    const showTabSettings = GlobalModel.tabSettingsOpen.get();
    const inputPosition = GlobalModel.inputPosition.get();

    return (
        <div
            ref={sessionRef}
            className={clsx("absolute inset-0 flex flex-col overflow-hidden", { "hidden": isHidden })}
            id={sessionId}
            data-sessionid={sessionId}
        >
            <If condition={!isHidden}>
                <SessionKeybindings key="keybindings" />
            </If>
            <ScreenTabs key={"tabs-" + sessionId} session={session} />
            <If condition={activeScreen != null}>
                <div
                    key="pulldown"
                    className={clsx(
                        "absolute w-full transition-all duration-200 ease-in-out overflow-hidden z-10 border-b-4 border-gray-700 bg-gray-800 rounded-b-md",
                        {
                            "h-0 border-b-0": !showTabSettings,
                            "h-auto": showTabSettings,
                            "top-[98px]": inputPosition === "top", // 38px (tabs) + 60px (input)
                            "top-[38px]": inputPosition !== "top", // Just tabs height
                        }
                    )}
                >
                    <Button
                        className="absolute top-2.5 right-2.5 p-1.5 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80"
                        onClick={toggleTabSettings}
                    >
                        <i className="fa-solid fa-sharp fa-xmark-large" />
                    </Button>
                    <TabSettings key={activeScreen.screenId} />
                    <If condition={showTabSettings && !isHidden}>
                        <TabSettingsPulldownKeybindings />
                    </If>
                </div>
            </If>
            <ErrorBoundary key="eb">
                <div className="flex flex-col flex-1 overflow-hidden">
                    <If condition={activeScreen != null && inputPosition === "top"}>
                        <CmdInput key={"cmdinput-" + sessionId} />
                    </If>
                    <ScreenView key={`screenview-${sessionId}`} session={session} screen={activeScreen} />
                    <If condition={activeScreen != null && inputPosition !== "top"}>
                        <CmdInput key={"cmdinput-" + sessionId} />
                    </If>
                </div>
            </ErrorBoundary>
        </div>
    );
});
