// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { observer } from "mobx-react";
import { action, observable } from "mobx";
import { clsx } from "clsx";
import dayjs from "dayjs";

import { ReactComponent as WorkspacesIcon } from "@/assets/icons/workspaces.svg";
import { ReactComponent as SettingsIcon } from "@/assets/icons/settings.svg";
import { ReactComponent as WaveLogo } from "@/assets/waveterm-logo.svg";

import localizedFormat from "dayjs/plugin/localizedFormat";
import { GlobalModel, GlobalCommandRunner, Session } from "@/models";
import { isBlank, openLink } from "@/utils/util";
import { ResizableSidebar } from "@/components/ui/resizable-sidebar";
import * as appconst from "@/app/appconst";

import { ActionsIcon, CenteredIcon, FrontIcon, StatusIndicator } from "@/components/icons/icons";

import "overlayscrollbars/overlayscrollbars.css";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";

dayjs.extend(localizedFormat);

const SideBarItem: React.FC<{
    frontIcon: React.ReactNode;
    contents: React.ReactNode | string;
    endIcons?: React.ReactNode[];
    className?: string;
    onClick?: React.MouseEventHandler<HTMLDivElement>;
}> = ({ frontIcon, contents, endIcons, className, onClick }) => {
    return (
        <div
            className={clsx(
                "flex flex-row items-center p-2 m-1 rounded-md hover:bg-gray-700 cursor-pointer",
                "unselectable",
                className
            )}
            onClick={onClick}
        >
            <FrontIcon>{frontIcon}</FrontIcon>
            <div className="flex-grow truncate">{contents}</div>
            <div className="flex items-center h-5">{endIcons}</div>
        </div>
    );
};

interface MainSideBarProps {
    parentRef: React.RefObject<HTMLDivElement>;
}

const MainSideBar: React.FC<MainSideBarProps> = observer(({ parentRef }) => {
    const handleSessionClick = (sessionId: string) => {
        GlobalCommandRunner.switchSession(sessionId);
    };

    const handleNewSession = () => {
        GlobalCommandRunner.createNewSession();
    };

    const handleConnectionsClick = () => {
        if (GlobalModel.activeMainView.get() == "connections") {
            GlobalModel.showSessionView();
            return;
        }
        GlobalCommandRunner.connectionsView();
    };

    const handleSettingsClick = () => {
        if (GlobalModel.activeMainView.get() == "clientsettings") {
            GlobalModel.showSessionView();
            return;
        }
        GlobalCommandRunner.clientSettingsView();
    };

    const openSessionSettings = (e: any, session: Session) => {
        e.preventDefault();
        e.stopPropagation();
        action(() => {
            GlobalModel.sessionSettingsModal.set(session.sessionId);
        })();
        GlobalModel.modalsModel.pushModal(appconst.SESSION_SETTINGS);
    };

    const getUpdateAppBanner = (): React.ReactNode => {
        const status = GlobalModel.appUpdateStatus.get();
        if (status == "ready") {
            return (
                <SideBarItem
                    key="update-ready"
                    className="font-bold"
                    frontIcon={<i className="fa-sharp fa-regular fa-circle-up icon text-lg" />}
                    contents="Click to Install Update"
                    onClick={() => GlobalModel.installAppUpdate()}
                />
            );
        } else {
            return null;
        }
    };

    const getSessions = () => {
        if (!GlobalModel.sessionListLoaded.get()) return <div className="item">loading ...</div>;
        const sessionList: Session[] = [];
        const activeSessionId = GlobalModel.activeSessionId.get();
        for (const session of GlobalModel.sessionList) {
            if (!session.archived.get() || session.sessionId == activeSessionId) {
                sessionList.push(session);
            }
        }
        return sessionList.map((session, index) => {
            const isActive = activeSessionId == session.sessionId;
            const showHighlight = isActive && GlobalModel.activeMainView.get() == "session";
            const sessionScreens = GlobalModel.getSessionScreens(session.sessionId);
            const sessionIndicator = Math.max(...sessionScreens.map((screen) => screen.statusIndicator.get()));
            const sessionRunningCommands = sessionScreens.some((screen) => screen.numRunningCmds.get() > 0);
            return (
                <SideBarItem
                    key={session.sessionId}
                    className={clsx({ "font-bold": isActive, "bg-gray-700": showHighlight })}
                    frontIcon={<span className="text-xs">{index + 1}</span>}
                    contents={session.name.get()}
                    endIcons={[
                        <StatusIndicator
                            key="statusindicator"
                            level={sessionIndicator}
                            runningCommands={sessionRunningCommands}
                        />,
                        <ActionsIcon key="actions" onClick={(e) => openSessionSettings(e, session)} />,
                    ]}
                    onClick={() => handleSessionClick(session.sessionId)}
                />
            );
        });
    };

    const mainView = GlobalModel.activeMainView.get();
    const connectionsActive = mainView == "connections";
    const settingsActive = mainView == "clientsettings";

    return (
        <ResizableSidebar
            collapsed={GlobalModel.mainSidebarModel.getCollapsed()}
            className="flex flex-col bg-gray-900 border-r border-gray-800"
            position="left"
            ref={parentRef}
        >
            <div
                className="title-bar-drag flex items-center relative border-b border-gray-800 flex-shrink-0"
                style={{ height: "calc(var(--screentabs-height) + 1px)" }}
            >
                <div
                    className="close-button absolute right-0 h-full flex items-center p-2.5 cursor-pointer"
                    onClick={() =>
                        GlobalModel.mainSidebarModel.setCollapsed(!GlobalModel.mainSidebarModel.getCollapsed())
                    }
                >
                    <i className="fa-sharp fa-solid fa-xmark-large" />
                </div>
            </div>
            <div className="flex flex-col flex-1 min-h-0">
                <div className="top pr-1.5 flex-shrink-0">
                    <SideBarItem
                        key="connections"
                        frontIcon={<i className="fa-sharp fa-regular fa-globe icon" />}
                        className={clsx({ "bg-gray-700": connectionsActive })}
                        contents="Connections"
                        onClick={handleConnectionsClick}
                    />
                </div>
                <div className="separator h-px my-4 bg-gray-800 flex-shrink-0" />
                <SideBarItem
                    key="workspaces"
                    className="workspaces flex-shrink-0"
                    frontIcon={<WorkspacesIcon className="icon" />}
                    contents="Workspaces"
                    endIcons={[
                        <CenteredIcon
                            key="add-workspace"
                            className="add-workspace hoverEffect"
                            onClick={handleNewSession}
                        >
                            <i className="fa-sharp fa-solid fa-plus"></i>
                        </CenteredIcon>,
                    ]}
                />
                <OverlayScrollbarsComponent
                    element="div"
                    className="middle p-1 border-b border-gray-800 flex-1 min-h-0 overflow-y-auto"
                    id="sidebar-middle"
                    options={{ scrollbars: { autoHide: "leave" } }}
                >
                    {getSessions()}
                </OverlayScrollbarsComponent>

                <div className="bottom pr-1.5 flex-shrink-0 pb-4" id="sidebar-bottom">
                    {getUpdateAppBanner()}
                    <SideBarItem
                        key="settings"
                        frontIcon={<SettingsIcon className="icon" />}
                        className={clsx({ "bg-gray-700": settingsActive })}
                        contents="Settings"
                        onClick={handleSettingsClick}
                    />
                </div>
            </div>
        </ResizableSidebar>
    );
});

export { MainSideBar };
