import { SetMetadata } from '@nestjs/common';
import { AvailableModules } from '../../shared/enums/modules.enum';

export const MODULE_NAME_KEY = 'moduleName';
export const ModuleName = (module: AvailableModules) => SetMetadata(MODULE_NAME_KEY, module);
