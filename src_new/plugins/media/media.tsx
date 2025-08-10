// Copyright 2024, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { observer } from "mobx-react";
import * as util from "@/utils/util";
import { GlobalModel } from "@/models";

export const SimpleMediaRenderer: React.FC<{
    data: ExtBlob;
    context: RendererContext;
    opts: RendererOpts;
    savedHeight: number;
    lineState: LineStateType;
}> = observer(({ data, opts, lineState }) => {
    if (data == null || data.notFound) {
        return (
            <div className="flex flex-row items-center justify-center pt-2" style={{ fontSize: opts.termFontSize }}>
                <div className="text-red-500">
                    ERROR: file {data?.name ? JSON.stringify(data.name) : ""} not found
                </div>
            </div>
        );
    }

    const fileUrl = lineState["wave:fileurl"];
    if (util.isBlank(fileUrl)) {
        return (
            <div className="flex flex-row items-center justify-center pt-2" style={{ fontSize: opts.termFontSize }}>
                <div className="text-red-500">
                    ERROR: no fileurl found (please use `mediaview` to view media files)
                </div>
            </div>
        );
    }

    const fullVideoUrl = GlobalModel.getBaseHostPort() + fileUrl;
    const height = opts.idealSize.height - 10;
    const width = opts.maxSize.width - 10;

    return (
        <div className="flex flex-row items-center justify-center pt-2" style={{ height, width }}>
            <video controls className="object-contain object-center h-full w-auto">
                <source src={fullVideoUrl} />
            </video>
        </div>
    );
});