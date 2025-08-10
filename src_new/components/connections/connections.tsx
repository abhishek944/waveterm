// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { observer } from "mobx-react";
import * as mobx from "mobx";
import { If, For } from "tsx-control-statements/components";
import { clsx } from "clsx";
import { GlobalModel, RemotesModel, GlobalCommandRunner } from "@/models";
import { Button, Status } from "@/common/elements";
import * as util from "@/util/util";
import { MainView } from "@/app/common/elements/mainview";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";

const ConnectionsKeybindings: React.FC = () => {
    React.useEffect(() => {
        const connectionViewModel = GlobalModel.connectionViewModel;
        const keybindManager = GlobalModel.keybindManager;
        keybindManager.registerKeybinding("mainview", "connections", "generic:cancel", () => {
            connectionViewModel.closeView();
            return true;
        });

        return () => {
            keybindManager.unregisterDomain("connections");
        };
    }, []);

    return null;
};

export const ConnectionsView: React.FC<{ model: RemotesModel }> = observer(({ model }) => {
    const [hoveredItemId, setHoveredItemId] = React.useState<string | null>(null);
    const tableRef = React.useRef<HTMLTableElement>(null);

    const getName = (item: RemoteType) => {
        const { remotealias, remotecanonicalname } = item;
        return remotealias ? `${remotealias} [${remotecanonicalname}]` : remotecanonicalname;
    };

    const getImportSymbol = (item: RemoteType) => {
        const { sshconfigsrc } = item;
        if (sshconfigsrc === "sshconfig-import") {
            return <i title="Connection Imported from SSH Config" className="fa-sharp fa-solid fa-file-import" />;
        }
        return null;
    };

    const handleAddConnection = () => {
        GlobalModel.remotesModel.openAddModal({ remoteedit: true });
    };

    const handleImportSshConfig = () => {
        GlobalCommandRunner.importSshConfig();
    };

    const handleRead = (remoteId: string) => {
        GlobalModel.remotesModel.openReadModal(remoteId);
    };

    const getStatus = (status: string) => {
        switch (status) {
            case "connected":
                return "green";
            case "disconnected":
                return "gray";
            default:
                return "red";
        }
    };

    const handleClose = () => {
        GlobalModel.connectionViewModel.closeView();
    };

    const isHidden = GlobalModel.activeMainView.get() !== "connections";
    if (isHidden) {
        return null;
    }

    const items = util.sortAndFilterRemotes(GlobalModel.remotes.slice());

    return (
        <MainView className="connections-view" title="Connections" onClose={handleClose}>
            <If condition={!isHidden}>
                <ConnectionsKeybindings />
            </If>
            <OverlayScrollbarsComponent
                className="flex-grow overflow-y-scroll max-h-[85vh] w-fit max-w-[970px]"
                options={{ scrollbars: { autoHide: "leave" } }}
                defer={true}
            >
                <table
                    className="m-2.5 table-fixed relative"
                    cellSpacing="0"
                    cellPadding="0"
                    border={0}
                    ref={tableRef}
                    onMouseLeave={() => setHoveredItemId(null)}
                >
                    <colgroup>
                        <col className="max-w-[650px]" />
                        <col className="max-w-[150px]" />
                        <col className="max-w-[200px]" />
                    </colgroup>
                    <thead className="rounded select-none">
                        <tr>
                            <th className="sticky top-0 h-8 px-2.5 py-1.25 text-main border-b-2 border-bright-blue bg-dark-blue">
                                <div>Name</div>
                            </th>
                            <th className="sticky top-0 h-8 px-2.5 py-1.25 text-main border-b-2 border-bright-blue bg-dark-blue">
                                <div>Type</div>
                            </th>
                            <th className="sticky top-0 h-8 px-2.5 py-1.25 text-main border-b-2 border-bright-blue bg-dark-blue">
                                <div>Status</div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <For index="idx" each="item" of={items}>
                            <tr
                                <tr
                                    key={item.remoteid}
                                    className={clsx("border-b border-gray-700 text-main cursor-pointer hover:bg-hover", {
                                        "bg-hover": hoveredItemId === item.remoteid,
                                    })}
                                    onMouseEnter={() => setHoveredItemId(item.remoteid)}
                                    onClick={() => handleRead(item.remoteid)}
                                >
                                    <td className="h-10 px-2.5 py-1.25 align-middle flex flex-row items-center">
                                        <Status status={getStatus(item.status)} text="" />
                                        {getName(item)}&nbsp;{getImportSymbol(item)}
                                    </td>
                                    <td className="h-10 px-2.5 py-1.25 align-middle">
                                        <div>{item.remotetype}</div>
                                    </td>
                                    <td className="h-10 px-2.5 py-1.25 align-middle">
                                        <div>
                                            <Status status={getStatus(item.status)} text={item.status} />
                                        </div>
                                    </td>
                                </tr>
                        </For>
                    </tbody>
                </table>
            </OverlayScrollbarsComponent>
            <footer className="ml-2.5 mt-2.5 flex flex-row flex-shrink-0 gap-2">
                <Button
                    className="secondary"
                    leftIcon={<i className="fa-sharp fa-solid fa-plus" />}
                    onClick={handleAddConnection}
                >
                    New Connection
                </Button>
                <Button
                    className="secondary"
                    leftIcon={<i className="fa-sharp fa-solid fa-fw fa-file-import" />}
                    onClick={handleImportSshConfig}
                >
                    Import Config
                </Button>
            </footer>
            <If condition={items.length === 0}>
                <div className="flex flex-row justify-center p-8 border border-white rounded m-5">
                    <div>No Connections Items Found</div>
                </div>
            </If>
        </MainView>
    );
});