import * as React from "react";
import { observer } from "mobx-react";
import { clsx } from "clsx";
import { getRemoteStrWithAlias } from "@/components/prompt/prompt";
import * as util from "@/utils/util";
import * as appconst from "@/appconst";
import { ReactComponent as GlobeIcon } from "@/components/assets/icons/globe.svg";
import { TextField } from "@/components/ui/textfield";
import { TabIcon } from "@/components/ui/tabicon";
import { Select, SelectTrigger, SelectContent, SelectItem } from "@/components/ui/select";
import { GlobalCommandRunner, GlobalModel, Screen } from "@/models";

export const TabNameTextField: React.FC<{ screen: Screen; errorMessage?: OV<string> }> = observer(
    ({ screen, errorMessage }) => {
        const updateName = (e: React.ChangeEvent<HTMLInputElement>) => {
            const val = e.target.value;
            if (util.isStrEq(val, screen.name.get())) {
                return;
            }
            const prtn = GlobalCommandRunner.screenSetSettings(screen.screenId, { name: val }, false);
            util.commandRtnHandler(prtn, errorMessage);
        };

        return <TextField label="Name" required={true} defaultValue={screen.name.get() ?? ""} onChange={updateName} />;
    }
);

export const TabColorSelector: React.FC<{ screen: Screen; errorMessage?: OV<string> }> = observer(
    ({ screen, errorMessage }) => {
        const selectTabColor = (color: string) => {
            if (screen.getTabColor() === color) {
                return;
            }
            const prtn = GlobalCommandRunner.screenSetSettings(screen.screenId, { tabcolor: color }, false);
            util.commandRtnHandler(prtn, errorMessage);
        };

        const curColor = screen.getTabColor() || "green";

        return (
            <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1">
                    <TabIcon icon={screen.getTabIcon()} color={screen.getTabColor()} />
                    <div className="tab-color-name">{screen.getTabColor()}</div>
                </div>
                <div className="text-gray-500">|</div>
                <div className="flex flex-col space-y-1">
                    <div className="flex space-x-1">
                        {appconst.TabColors.slice(0, 10).map((color) => (
                            <div key={color} className="cursor-pointer" onClick={() => selectTabColor(color)}>
                                <TabIcon icon="square" color={color} />
                            </div>
                        ))}
                    </div>
                    <div className="flex space-x-1">
                        {appconst.TabColors.slice(10).map((color) => (
                            <div key={color} className="cursor-pointer" onClick={() => selectTabColor(color)}>
                                <TabIcon icon="square" color={color} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }
);

export const TabIconSelector: React.FC<{ screen: Screen; errorMessage?: OV<string> }> = observer(
    ({ screen, errorMessage }) => {
        const selectTabIcon = (icon: string) => {
            if (screen.getTabIcon() === icon) {
                return;
            }
            const prtn = GlobalCommandRunner.screenSetSettings(screen.screenId, { tabicon: icon }, false);
            util.commandRtnHandler(prtn, errorMessage);
        };

        const curIcon = screen.getTabIcon() || "square";
        const curColor = screen.getTabColor();

        return (
            <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1">
                    <TabIcon icon={curIcon} color={curColor} />
                    <div className="tab-icon-name">{curIcon}</div>
                </div>
                <div className="text-gray-500">|</div>
                <div className="flex space-x-1">
                    {appconst.TabIcons.map((icon) => (
                        <div key={icon} className="cursor-pointer" onClick={() => selectTabIcon(icon)}>
                            <TabIcon icon={icon} color={curColor} />
                        </div>
                    ))}
                </div>
            </div>
        );
    }
);

export const TabRemoteSelector: React.FC<{ screen: Screen; errorMessage?: OV<string> }> = observer(
    ({ screen, errorMessage }) => {
        const [selectedRemoteCN, setSelectedRemoteCN] = React.useState<string | null>(null);

        const selectRemote = (cname: string) => {
            if (cname == null) {
                GlobalModel.remotesModel.openAddModal({ remoteedit: true });
                return;
            }
            setSelectedRemoteCN(cname);
            const prtn = GlobalCommandRunner.screenSetRemote(cname, true, true);
            util.commandRtnHandler(prtn, errorMessage);
            prtn.then(() => GlobalModel.inputModel.giveFocus());
        };

        const getOptions = () => {
            const remotes = GlobalModel.remotes
                .filter((r) => !r.archived)
                .map((remote) => ({
                    ...remote,
                    label: getRemoteStrWithAlias(remote),
                    value: remote.remotecanonicalname,
                }))
                .sort((a, b) => {
                    const connValA = util.getRemoteConnVal(a);
                    const connValB = util.getRemoteConnVal(b);
                    return connValA !== connValB ? connValA - connValB : a.remoteidx - b.remoteidx;
                });
            remotes.push({
                label: "New Connection",
                value: null,
                icon: <i className="fa-sharp fa-solid fa-plus" />,
                noop: true,
            });
            return remotes;
        };

        let selectedRemote: string;
        if (selectedRemoteCN != null) {
            selectedRemote = selectedRemoteCN;
        } else {
            const curRI = screen.getCurRemoteInstance();
            if (curRI != null) {
                const curRemote = GlobalModel.getRemote(curRI.remoteid);
                selectedRemote = curRemote.remotecanonicalname;
            } else {
                const localRemote = GlobalModel.getLocalRemote();
                selectedRemote = localRemote.remotecanonicalname;
            }
        }
        const curRemote = GlobalModel.getRemoteByName(selectedRemote);

        return (
            <Select onValueChange={selectRemote} defaultValue={curRemote.remotecanonicalname}>
                <SelectTrigger className="w-full">
                    <div className="flex items-center">
                        <GlobeIcon className="w-4 h-4" />
                        <span className="ml-2">{curRemote.remotecanonicalname}</span>
                    </div>
                </SelectTrigger>
                <SelectContent>
                    {getOptions().map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        );
    }
);