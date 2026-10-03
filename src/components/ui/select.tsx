import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption = {
  label: string;
  value: string;
};

type SelectProps = {
  "aria-label": string;
  disabled?: boolean;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  value: string;
};

export function Select({ options, value, onValueChange, disabled, ...props }: SelectProps) {
  return (
    <SelectPrimitive.Root
      items={options}
      value={value}
      onValueChange={(next) => onValueChange(next ?? options[0]?.value ?? "")}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger className="select-trigger" {...props}>
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon className="select-icon">
          <ChevronDown aria-hidden="true" size={14} strokeWidth={2} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner className="select-positioner" sideOffset={6}>
          <SelectPrimitive.Popup className="select-popup">
            <SelectPrimitive.List>
              <SelectPrimitive.Group>
                {options.map((option) => (
                  <SelectPrimitive.Item
                    className="select-item"
                    key={option.value}
                    value={option.value}
                  >
                    <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                    <SelectPrimitive.ItemIndicator className="select-indicator">
                      <Check aria-hidden="true" size={14} strokeWidth={2.5} />
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Group>
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
