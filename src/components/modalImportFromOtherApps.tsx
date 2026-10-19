import { JSX, useCallback } from "react";
import { View } from "react-native";
import { Text } from "./primitives/text";
import { GroupHeader } from "./groupHeader";
import { MenuItemWrapper } from "./menuItem";
import { IDispatch } from "../ducks/types";
import { Thunk_importHevyData, Thunk_importMacroFactorData, Thunk_importMacroFactorTrendWeight } from "../ducks/thunks";
import { ISettings } from "../types";
import { FileImport_pickFile } from "../utils/fileImport";

interface IModalImportFromOtherAppsContentProps {
  settings: ISettings;
  onClose: () => void;
  dispatch: IDispatch;
}

export function ModalImportFromOtherAppsContent(props: IModalImportFromOtherAppsContentProps): JSX.Element {
  const onUploadHevy = useCallback(async () => {
    const contents = await FileImport_pickFile("csv");
    if (contents == null) {
      return;
    }
    props.onClose();
    // The pushed screen inherits the modal's bounded container if navigation happens before the
    // modal finishes closing, so delay the dispatch
    setTimeout(() => props.dispatch(Thunk_importHevyData(contents)), 50);
  }, [props.dispatch, props.onClose]);

  const onUploadMacroFactor = useCallback(async () => {
    const contents = await FileImport_pickFile("csv");
    if (contents == null) return;
    props.onClose();
    setTimeout(() => props.dispatch(Thunk_importMacroFactorData(contents)), 50);
  }, [props.dispatch, props.onClose]);

  const onUploadTrend = useCallback(async () => {
    const contents = await FileImport_pickFile("csv");
    if (contents == null) return;
    props.onClose();
    setTimeout(() => props.dispatch(Thunk_importMacroFactorTrendWeight(contents)), 50);
  }, [props.dispatch, props.onClose]);

  return (
    <View>
      <GroupHeader size="large" name="Import history from other apps" />
      <MenuItemWrapper name="Import MacroFactor Trend Weight CSV (estimated)" onClick={onUploadTrend}>
        <Text className="py-3">Import MacroFactor trend weight CSV (not scale measurements)</Text>
      </MenuItemWrapper>
      <MenuItemWrapper name="Upload MacroFactor Workouts CSV" onClick={onUploadMacroFactor}>
        <Text className="py-3">Upload MacroFactor Workouts CSV</Text>
      </MenuItemWrapper>
      <MenuItemWrapper name="Upload CSV file from Hevy" onClick={onUploadHevy}>
        <Text className="py-3">Upload CSV file from Hevy</Text>
      </MenuItemWrapper>
    </View>
  );
}
