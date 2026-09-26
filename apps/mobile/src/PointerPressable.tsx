import { Pressable as NativePressable, type PressableProps, type ViewStyle } from "react-native";

export function Pressable({style,...props}:PressableProps){
  const pointerStyle:ViewStyle={cursor:props.disabled?"auto":"pointer"};
  return <NativePressable
    {...props}
    style={state=>[
      pointerStyle,
      typeof style==="function"?style(state):style,
    ]}
  />;
}
