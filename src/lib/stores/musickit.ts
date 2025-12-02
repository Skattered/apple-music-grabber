import { writable } from 'svelte/store';

export interface MusicKitState {
	isLoaded: boolean;
	isConfigured: boolean;
	isAuthorized: boolean;
	developerToken: string;
	musicUserToken: string;
	instance: any;
}

export const musicKitStore = writable<MusicKitState>({
	isLoaded: false,
	isConfigured: false,
	isAuthorized: false,
	developerToken: '',
	musicUserToken: '',
	instance: null
});
