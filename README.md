# Notes-Organizer

A centralized repository for organizing and managing notes, snippets, images, and screenshots using a Chrome extension. This repository serves as the storage backend for the GitHub Notes Organizer Chrome extension.

## Overview

Notes-Organizer helps you:
- Store and organize web content in categorized Markdown files
- Save important text snippets with source references
- Maintain a collection of screenshots and images
- Keep your research and references organized by topics

## Repository Structure

## Features

- 📝 Save selected text from any webpage
- 📸 Capture screenshots of the current page
- 🖼️ Drag and drop or upload images
- 📁 Organize notes into categories
- 🔄 Auto-updates category list
- 🔒 Secure GitHub token storage
- 🎯 Source URL tracking
- 📱 Draggable and persistent popup window

## Installation

1. Clone this repository or download the source code
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory

## Setup

1. Create a GitHub Personal Access Token:
   - Go to GitHub Settings > Developer settings > Personal access tokens
   - Generate a new token with 'repo' scope
   - Copy the token

2. Configure the Extension:
   - Click the extension icon
   - Click on "GitHub Settings"
   - Enter your:
     - GitHub Personal Access Token
     - Repository Owner (username)
     - Repository Name
   - Check "Remember these settings" if desired
   - Click "Save Settings"

## Usage

1. **Save Text**:
   - Select text on any webpage
   - Click the extension icon
   - Choose or create a category
   - Click "Save to GitHub"

2. **Take Screenshots**:
   - Click the extension icon
   - Click "Take Screenshot"
   - Select the area you want to capture
   - Choose a category
   - Click "Save to GitHub"

3. **Upload Images**:
   - Click the extension icon
   - Drag and drop images into the drop zone
   - Or click to select files
   - Choose a category
   - Click "Save to GitHub"

## File Organization

The extension organizes your notes in your GitHub repository like this: 