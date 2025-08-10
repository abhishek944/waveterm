// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { clsx } from "clsx";

let idCounter = 0;

interface CheckboxProps {
    checked?: boolean;
    defaultChecked?: boolean;
    onChange: (value: boolean) => void;
    label: React.ReactNode;
    className?: string;
    id?: string;
}

const Checkbox: React.FC<CheckboxProps> = ({
    checked,
    defaultChecked,
    onChange,
    label,
    className,
    id
}) => {
    const [checkedInternal, setCheckedInternal] = React.useState(
        checked ?? Boolean(defaultChecked)
    );
    const generatedId = React.useRef(`checkbox-${idCounter++}`);
    
    React.useEffect(() => {
        if (checked !== undefined) {
            setCheckedInternal(checked);
        }
    }, [checked]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newChecked = e.target.checked;
        if (checked === undefined) {
            setCheckedInternal(newChecked);
        }
        onChange(newChecked);
    };

    const checkboxId = id || generatedId.current;

    return (
        <div className={clsx("checkbox", className)}>
            <input
                type="checkbox"
                id={checkboxId}
                checked={checkedInternal}
                onChange={handleChange}
                aria-checked={checkedInternal}
                role="checkbox"
            />
            <label htmlFor={checkboxId}>
                <span></span>
                {label}
            </label>
        </div>
    );
};

export { Checkbox };