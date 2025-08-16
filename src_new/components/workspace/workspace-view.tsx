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

dayjs.extend(localizedFormat);

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



export const WorkspaceView: React.FC = observer(() => {
    const sessionRef = React.useRef<HTMLDivElement>(null);

    const session = GlobalModel.getActiveSession();
    let activeScreen: any | null = null;
    let sessionId: string = "none";
    if (session != null) {
        sessionId = session.sessionId;
        activeScreen = session.getActiveScreen();
    }
    const isHidden = GlobalModel.activeMainView.get() != "session";
    const mainSidebarModel = GlobalModel.mainSidebarModel;
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
            <ErrorBoundary key="eb">
                <div className="flex flex-col flex-1 overflow-hidden pr-2">
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
