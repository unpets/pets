import { mount } from 'svelte';
import Pet from './Pet.svelte';
import './pet.css';

mount(Pet, { target: document.getElementById('app')! });
