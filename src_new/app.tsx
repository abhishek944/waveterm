// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import * as mobxReact from "mobx-react";
import { clsx } from "clsx";

import { GlobalModel } from "@/models";
// import { isBlank } from "@/lib/utils";
import { WorkspaceView } from "@/components/workspace/workspace-view";

// Temporary until utils is properly set up
function isBlank(s: string | null | undefined): boolean {
    return s == null || s === "";
}
// TODO: PluginsView needs to be migrated from src/app/pluginsview/pluginsview.tsx
import { BookmarksView } from "@/components/bookmarks/bookmarks";
import { HistoryView } from "@/components/history/history";
import { ConnectionsView } from "@/components/connections/connections";
import { ClientSettingsView } from "@/components/elements/clientsettings";
// TODO: MainSideBar and RightSideBar need to be migrated from src/app/sidebar/
import { DisconnectedModal, ClientStopModal } from "@/components/modals";
import { ModalsProvider } from "@/components/modals/provider";
import { Button } from "@/components/ui/button";
// TODO: ErrorBoundary needs to be migrated from src/app/common/error/errorboundary.tsx
// TODO: TermStyleList needs to be migrated from src/app/common/elements/

import "./globals.css";

const App: React.FC = mobxReact.observer(() => {
    const [dcWait, setDcWait] = React.useState(false);
    const termThemesLoaded = true; // TODO: restore termThemesLoaded logic when TermStyleList is migrated
    const mainContentRef = React.useRef<HTMLDivElement>(null);
    const chatFocusTimeoutId = React.useRef<NodeJS.Timeout | null>(null);

    React.useEffect(() => {
        if (GlobalModel.isDev) {
            document.body.classList.add("is-dev");
        }

        return () => {
            if (chatFocusTimeoutId.current) {
                clearTimeout(chatFocusTimeoutId.current);
                chatFocusTimeoutId.current = null;
            }
        };
    }, []);

    const handleContextMenu = React.useCallback((e: React.MouseEvent) => {
        let isInNonTermInput = false;
        const activeElem = document.activeElement;
        if (activeElem != null && activeElem.nodeName === "TEXTAREA") {
            if (!activeElem.classList.contains("xterm-helper-textarea")) {
                isInNonTermInput = true;
            }
        }
        if (activeElem != null && activeElem.nodeName === "INPUT" && activeElem.getAttribute("type") === "text") {
            isInNonTermInput = true;
        }
        const opts: ContextMenuOpts = {};
        if (isInNonTermInput) {
            opts.showCut = true;
        }
        const sel = window.getSelection();
        if (!isBlank(sel?.toString()) || isInNonTermInput) {
            GlobalModel.contextEditMenu(e.nativeEvent, opts);
        }
    }, []);

    const updateDcWait = React.useCallback((val: boolean) => {
        setDcWait(val);
    }, []);

    const openMainSidebar = React.useCallback(() => {
        GlobalModel.mainSidebarModel.setCollapsed(false);
    }, []);

    const openRightSidebar = React.useCallback(() => {
        GlobalModel.rightSidebarModel.setCollapsed(false);
        chatFocusTimeoutId.current = setTimeout(() => {
            GlobalModel.inputModel.setChatSidebarFocus();
        }, 100);
    }, []);

    const remotesModel = GlobalModel.remotesModel;
    const disconnected = !GlobalModel.ws.open.get() || !GlobalModel.waveSrvRunning.get();
    const hasClientStop = GlobalModel.getHasClientStop();
    const platform = GlobalModel.getPlatform();
    const clientData = GlobalModel.clientData.get();

    // Previously, this is done in sidebar.tsx but it causes flicker when clientData is null cos screen-view shifts around.
    // Doing it here fixes the flicker cos app is not rendered until clientData is populated.
    // wait for termThemes as well (this actually means that the "connect" packet has been received)
    if (clientData == null || GlobalModel.termThemes.get() == null) {
        return null;
    }

    if (disconnected || hasClientStop) {
        if (!dcWait) {
            setTimeout(() => updateDcWait(true), 1500);
        }
        return (
            <div id="main" className={`platform-${platform}`} onContextMenu={handleContextMenu}>
                <div ref={mainContentRef} className="main-content">
                    {/* <MainSideBar parentRef={mainContentRef} /> */}
                    <div className="session-view" />
                </div>
                {dcWait && (
                    <>
                        {disconnected && <DisconnectedModal />}
                        {!disconnected && hasClientStop && <ClientStopModal />}
                    </>
                )}
            </div>
        );
    }
    
    if (dcWait) {
        setTimeout(() => updateDcWait(false), 0);
    }

    // used to force a full reload of the application
    const renderVersion = GlobalModel.renderVersion.get();
    const mainSidebarCollapsed = GlobalModel.mainSidebarModel.getCollapsed();
    const rightSidebarCollapsed = GlobalModel.rightSidebarModel.getCollapsed();
    const activeMainView = GlobalModel.activeMainView.get();
    const lightDarkClass = GlobalModel.isDarkTheme.get() ? "is-dark" : "is-light";
    const mainClassName = clsx(
        `platform-${platform}`,
        {
            "mainsidebar-collapsed": mainSidebarCollapsed,
            "rightsidebar-collapsed": rightSidebarCollapsed,
        },
        lightDarkClass
    );

    return (
        <>
            {/* <TermStyleList onRendered={handleTermThemesRendered} /> */}
            <div
                key={`version-${renderVersion}`}
                id="main"
                className={mainClassName}
                onContextMenu={handleContextMenu}
            >
                {termThemesLoaded && (
                    <>
                        {mainSidebarCollapsed && (
                            <div key="logo-button" className="logo-button-container">
                                <div className="logo-button-spacer" />
                                <div className="logo-button" onClick={openMainSidebar}>
                                    <img src="public/logos/wave-logo.png" alt="logo" />
                                </div>
                            </div>
                        )}
                        {rightSidebarCollapsed && activeMainView === "session" && (
                            <div className="right-sidebar-triggers" title="Open Wave AI (Cmd-Shift-Space)">
                                <Button
                                    className="secondary ghost right-sidebar-trigger"
                                    onClick={openRightSidebar}
                                >
                                    <i className="fa-sharp fa-regular fa-sparkles"></i>
                                </Button>
                            </div>
                        )}
                        <div ref={mainContentRef} className="main-content">
                            {/* <MainSideBar parentRef={mainContentRef} /> */}
                            {/* <ErrorBoundary> */}
                                {/* <PluginsView /> */}
                                <WorkspaceView />
                                <HistoryView />
                                <BookmarksView />
                                <ConnectionsView model={remotesModel} />
                                <ClientSettingsView model={remotesModel} />
                            {/* </ErrorBoundary> */}
                            {/* <RightSideBar parentRef={mainContentRef} /> */}
                        </div>
                        <ModalsProvider />
                    </>
                )}
            </div>
        </>
    );
});

export { App };