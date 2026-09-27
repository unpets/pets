import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import Pet from './Pet.svelte';
import petStyles from './pet.css?inline';

const target = document.getElementById('app');
if (!target) throw new Error('The application mount point is missing.');

const companion = document.documentElement.dataset.petsHost === 'companion';
if (companion) {
  const style = document.createElement('style');
  style.textContent = petStyles;
  document.head.append(style);
}
export default companion ? mount(Pet, { target }) : mount(App, { target });
