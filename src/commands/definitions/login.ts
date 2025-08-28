import { CommandDefinition, CommandContext } from '../base.js';
import { ProviderType } from '../../providers/factory.js';

export const loginCommand: CommandDefinition = {
  command: 'login',
  description: 'Login with your credentials (optional: specify provider)',
  handler: ({ setShowProviderLogin, args }: CommandContext) => {
    // Check if a specific provider was specified
    const providerArg = args?.[0] as ProviderType;
    const validProviders: ProviderType[] = ['groq', 'openai', 'azure', 'openrouter', 'ollama'];
    
    if (providerArg && validProviders.includes(providerArg)) {
      // Direct provider login
      if (setShowProviderLogin) {
        setShowProviderLogin(providerArg);
      }
    } else {
      // Show provider selection first
      if (setShowProviderLogin) {
        setShowProviderLogin(null); // null means show provider selection
      }
    }
  }
};