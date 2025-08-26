import { CommandDefinition, CommandContext } from '../base.js';

export const modelCommand: CommandDefinition = {
  command: 'model',
  description: 'Select your provider and model',
  handler: ({ setShowProviderModelSelector }: CommandContext) => {
    if (setShowProviderModelSelector) {
      setShowProviderModelSelector(true);
    }
  }
};