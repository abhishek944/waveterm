// Copyright 2024, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { observer } from "mobx-react";

export const SimplePdfRenderer: React.FC<{
    data: ExtBlob;
    context: RendererContext;
    opts: RendererOpts;
    savedHeight: number;
}> = observer(({ data, opts }) => {
    const objUrl = React.useMemo(() => {
        if (data == null || data.notFound) {
            return null;
        }
        const pdfBlob = new File([data], data.name ?? "file.pdf", { type: "application/pdf" });
        return URL.createObjectURL(pdfBlob);
    }, [data]);

    React.useEffect(() => {
        return () => {
            if (objUrl) {
                URL.revokeObjectURL(objUrl);
            }
        };
    }, [objUrl]);

    if (data == null || data.notFound) {
        return (
            <div className="flex flex-row items-center justify-center pt-2" style={{ fontSize: opts.termFontSize }}>
                <div className="text-red-500">
                    ERROR: file {data?.name ? JSON.stringify(data.name) : ""} not found
                </div>
            </div>
        );
    }

    const maxHeight = opts.maxSize.height - 10;
    const maxWidth = opts.maxSize.width - 10;

    return (
        <div className="flex flex-row items-center justify-center pt-2">
            <iframe src={objUrl} width={maxWidth} height={maxHeight} name="pdfview" />
        </div>
    );
});