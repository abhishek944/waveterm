// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import React, { FC, useEffect, useState, useRef, useMemo } from "react";
import { GlobalModel } from "@/models";
import Papa from "papaparse";
import {
    createColumnHelper,
    flexRender,
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    FilterFn,
} from "@tanstack/react-table";
import { useTableNav } from "@table-nav/react";
import SortUpIcon from "./img/sort-up-solid.svg";
import SortDownIcon from "./img/sort-down-solid.svg";
import { clsx } from "clsx";

const MAX_DATA_SIZE = 10 * 1024 * 1024; // 10MB in bytes

type CSVRow = {
    [key: string]: string | number;
};

interface Props {
    data: ExtBlob;
    readOnly: boolean;
    context: RendererContext;
    opts: RendererOpts;
    savedHeight: number;
    lineState: LineStateType;
    shouldFocus: boolean;
    rendererApi: RendererModelContainerApi;
    scrollToBringIntoViewport: () => void;
}

const columnHelper = createColumnHelper<any>();

export const CSVRenderer: FC<Props> = (props: Props) => {
    const { data, opts, lineState, context, shouldFocus, rendererApi, savedHeight } = props;
    const { height: maxHeight } = opts.maxSize;

    const csvCacheRef = useRef(new Map<string, string>());
    const rowRef = useRef<(HTMLTableRowElement | null)[]>([]);
    const headerRef = useRef<HTMLTableRowElement | null>(null);
    const probeRef = useRef<HTMLTableRowElement | null>(null);
    const tbodyRef = useRef<HTMLTableSectionElement | null>(null);
    const [content, setContent] = useState<string | null>(null);
    const [tbodyHeight, setTbodyHeight] = useState(0);
    const [isFileTooLarge, setIsFileTooLarge] = useState<boolean>(false);
    const [tableLoaded, setTableLoaded] = useState(false);
    const { listeners } = useTableNav();

    const filePath = lineState["prompt:file"];
    const { screenId, lineId } = context;
    const cacheKey = `${screenId}-${lineId}-${filePath}`;

    const parsedData = useMemo<CSVRow[]>(() => {
        if (!content) return [];
        const trimmedContent = content.trim();
        const firstRow = trimmedContent.split("\n")[0];
        const hasHeaders = !!firstRow.match(/^[a-zA-Z"]/);
        const results = Papa.parse(trimmedContent, { header: hasHeaders });

        if (!hasHeaders && Array.isArray(results.data) && Array.isArray(results.data[0])) {
            const dataArray = results.data as string[][];
            const headers = Array.from({ length: dataArray[0].length }, (_, i) => `Column ${i + 1}`);
            results.data = dataArray.map((row) => {
                const newRow: CSVRow = {};
                row.forEach((value, index) => {
                    newRow[headers[index]] = value;
                });
                return newRow;
            });
        }

        return results.data.map((row) => {
            return Object.fromEntries(
                Object.entries(row as CSVRow).map(([key, value]) => {
                    if (typeof value === "string") {
                        const numberValue = parseFloat(value);
                        if (!isNaN(numberValue) && String(numberValue) === value) {
                            return [key, numberValue];
                        }
                    }
                    return [key, value];
                })
            ) as CSVRow;
        });
    }, [content]);

    const columns = useMemo(() => {
        if (parsedData.length === 0) return [];
        const headers = Object.keys(parsedData[0]);
        return headers.map((header) =>
            columnHelper.accessor(header, {
                header: () => header,
                cell: (info) => info.renderValue(),
            })
        );
    }, [parsedData]);

    useEffect(() => {
        const cachedContent = csvCacheRef.current.get(cacheKey);
        if (cachedContent) {
            setContent(cachedContent);
        } else {
            if (data.size > MAX_DATA_SIZE) {
                setIsFileTooLarge(true);
                return;
            }
            data.text().then((textContent: string) => {
                setContent(textContent);
                csvCacheRef.current.set(cacheKey, textContent);
            });
        }
    }, [data, cacheKey]);

    useEffect(() => {
        if (probeRef.current && headerRef.current && parsedData.length) {
            const rowHeight = probeRef.current.offsetHeight;
            const fullTBodyHeight = rowHeight * parsedData.length;
            const headerHeight = headerRef.current.offsetHeight;
            const maxHeightLessHeader = maxHeight - headerHeight;
            setTbodyHeight(Math.min(maxHeightLessHeader, fullTBodyHeight));
        }
    }, [probeRef, headerRef, maxHeight, parsedData]);

    useEffect(() => {
        let timer: any;
        if (rowRef.current.length === parsedData.length) {
            timer = setTimeout(() => setTableLoaded(true), 50);
        }
        return () => clearTimeout(timer);
    }, [rowRef, parsedData]);

    useEffect(() => {
        if (shouldFocus) {
            rendererApi.onFocusChanged(true);
        }
    }, [shouldFocus, rendererApi]);

    const table = useReactTable({
        manualPagination: true,
        data: parsedData,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    if (isFileTooLarge) {
        return (
            <div className="text-red-500" style={{ fontSize: GlobalModel.getTermFontSize() }}>
                The file size exceeds 10MB and cannot be displayed.
            </div>
        );
    }

    return (
        <div className={clsx("overflow-x-auto overflow-y-hidden", tableLoaded ? "opacity-100" : "opacity-0")} style={{ height: tableLoaded ? "auto" : savedHeight }}>
            <table className="absolute invisible">
                <tbody>
                    <tr ref={probeRef}>
                        <td>dummy data</td>
                    </tr>
                </tbody>
            </table>
            <table {...listeners} className="border-collapse overflow-x-auto border border-gray-500">
                <thead className="relative block w-full overflow-y-scroll">
                    {table.getHeaderGroups().map((headerGroup, index) => (
                        <tr key={headerGroup.id} ref={headerRef} id={headerGroup.id} tabIndex={index} className="border-b border-gray-500">
                            {headerGroup.headers.map((header, index) => (
                                <th
                                    key={header.id}
                                    colSpan={header.colSpan}
                                    id={header.id}
                                    tabIndex={index}
                                    style={{ width: header.getSize() }}
                                    className="text-main border-r border-gray-500 p-1 flex-grow text-left relative"
                                >
                                    {header.isPlaceholder ? null : (
                                        <div
                                            className={clsx("relative text-left pr-4 truncate", header.column.getCanSort() && "cursor-pointer select-none")}
                                            onClick={header.column.getToggleSortingHandler()}
                                        >
                                            {flexRender(header.column.columnDef.header, header.getContext())}
                                            {header.column.getIsSorted() === "asc" ? (
                                                <img src={SortUpIcon} className="absolute right-0 top-0.5 w-2 invert" alt="Ascending" />
                                            ) : header.column.getIsSorted() === "desc" ? (
                                                <img src={SortDownIcon} className="absolute right-0 top-0.5 w-2 invert" alt="Descending" />
                                            ) : null}
                                        </div>
                                    )}
                                </th>
                            ))}
                        </tr>
                    ))}
                </thead>
                <tbody style={{ height: `${tbodyHeight}px` }} ref={tbodyRef} className="block relative overflow-y-scroll overscroll-contain">
                    {table.getRowModel().rows.map((row, index) => (
                        <tr key={row.id} ref={(el) => (rowRef.current[index] = el)} id={row.id} tabIndex={index} className="w-full flex">
                            {row.getVisibleCells().map((cell) => (
                                <td key={cell.id} id={cell.id} tabIndex={index} className="border-r border-l border-gray-500 p-1 flex-grow text-left truncate">
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};