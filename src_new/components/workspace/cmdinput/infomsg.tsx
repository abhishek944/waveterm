// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { observer } from "mobx-react";
import { If, For } from "tsx-control-statements/components";
import { clsx } from "clsx";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import { GlobalModel } from "@/models";
import * as appconst from "@/app/appconst";
import { AuxiliaryCmdView } from "@/components/workspace";

dayjs.extend(localizedFormat);

const getAfterSlash = (s: string): string => {
    if (s.startsWith("^/") || s.startsWith("^")) {
        return s.substring(1);
    }
    let slashIdx = s.lastIndexOf("/");
    if (slashIdx === s.length - 1) {
        slashIdx = s.lastIndexOf("/", slashIdx - 1);
    }
    return slashIdx === -1 ? s : s.substring(slashIdx + 1);
};

const hasSpace = (s: string): boolean => s.includes(" ");

export const InfoMsg: React.FC = observer(() => {
    const inputModel = GlobalModel.inputModel;
    const infoMsg: InfoType = inputModel.infoMsg.get();
    const infoShow = inputModel.getActiveAuxView() === appconst.InputAuxView_Info;

    if (!infoShow || !infoMsg) {
        return null;
    }

    const handleCompClick = (s: string) => {
        // TODO -> complete to this completion
    };

    return (
        <AuxiliaryCmdView
            title={infoMsg.infotitle}
            className="cmd-input-info font-mono text-sm leading-6"
            onClose={() => GlobalModel.inputModel.closeAuxView()}
        >
            <If condition={infoMsg.infomsg}>
                <div className="info-msg text-blue-500 pb-0.5">
                    <If condition={infoMsg.infomsghtml}>
                        <span dangerouslySetInnerHTML={{ __html: infoMsg.infomsg }} />
                    </If>
                    <If condition={!infoMsg.infomsghtml}>{infoMsg.infomsg}</If>
                </div>
            </If>
            <If condition={infoMsg.infolines}>
                <div className="info-lines text-main whitespace-pre pb-1.5">
                    <For index="idx" each="line" of={infoMsg.infolines}>
                        <div key={idx}>{line === "" ? " " : line}</div>
                    </For>
                </div>
            </If>
            <If condition={infoMsg.infocomps?.length > 0}>
                <div className="info-comps flex flex-row flex-wrap pb-1.5 font-normal">
                    <For each="istr" index="idx" of={infoMsg.infocomps}>
                        <div
                            onClick={() => handleCompClick(istr)}
                            key={idx}
                            className={clsx(
                                "info-comp min-w-[200px] text-white mr-2.5",
                                { "has-space underline-dotted": hasSpace(istr) },
                                { "metacmd-comp text-green-400": istr.startsWith("^") }
                            )}
                        >
                            {getAfterSlash(istr)}
                        </div>
                    </For>
                    <If condition={infoMsg.infocompsmore}>
                        <div key="more" className="info-comp select-none">
                            ...
                        </div>
                    </If>
                </div>
            </If>
            <If condition={infoMsg.infoerror}>
                <div key="infoerror" className="info-error text-red-500 pb-0.5">
                    [error] {infoMsg.infoerror}
                </div>
                <If condition={infoMsg.infoerrorcode === appconst.ErrorCode_InvalidCwd}>
                    <div className="info-error text-red-500">to reset, run: /reset:cwd</div>
                </If>
            </If>
        </AuxiliaryCmdView>
    );
});