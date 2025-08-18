// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import * as mobx from "mobx";
import { observer } from "mobx-react";

export const SimpleImageRenderer: React.FC<{
    data: ExtBlob;
    context: RendererContext;
    opts: RendererOpts;
    savedHeight: number;
}> = observer(({ data, opts, savedHeight }) => {
    const [imageLoaded, setImageLoaded] = React.useState(false);
    const imageRef = React.useRef<HTMLImageElement>(null);
    const objUrl = React.useMemo(() => {
        if (data == null || data.notFound) {
            return null;
        }
        let dataBlob = data;
        if (data.name?.endsWith(".svg")) {
            dataBlob = new Blob([data], { type: "image/svg+xml" }) as ExtBlob;
        }
        return URL.createObjectURL(dataBlob);
    }, [data]);

    React.useEffect(() => {
        const img = imageRef.current;
        if (img?.complete) {
            setImageLoaded(true);
        } else if (img) {
            img.onload = () => setImageLoaded(true);
        }
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

    let forceHeight: number | undefined = undefined;
    if (!imageLoaded && savedHeight >= 0) {
        forceHeight = savedHeight;
    }

    return (
        <div className="flex flex-row items-center justify-center pt-2" style={{ minHeight: forceHeight || opts.idealSize.height }}>
            <img
                ref={imageRef}
                style={{ maxHeight: opts.idealSize.height, maxWidth: opts.idealSize.width }}
                src={objUrl}
                className="block"
            />
        </div>
    );
});