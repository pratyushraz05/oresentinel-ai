"""
RoomScale AI - Photo Collection Guide
Instructions for collecting training data from your room
"""

import sys
from pathlib import Path

print("""
============================================
   ROOMSCALE AI - DATA COLLECTION GUIDE
============================================

HOW TO COLLECT TRAINING PHOTOS FOR YOUR ROOM:

Step 1: Take Photos
-------------------
Use your phone or laptop camera to take photos of objects around you:

GOOD PHOTO TIPS:
  - Keep the object centered in the frame
  - Good lighting (not too dark or backlight)
  - Show the FULL object (don't crop it)
  - Vary distances (close-up, medium, far)
  - Different angles if possible
  - Include different backgrounds (desk, table, floor)

OBJECTS TO CAPTURE:
  * Smartphone (any model)
  * Laptop / Tablet
  * Books (hardcover & paperback)
  * Mugs / Cups
  * Bottles (water, soda, etc.)
  * Computer mouse
  * Keyboard
  * Monitor / Screen
  * Remote control
  * Any other items in your room

TARGET: At least 20-30 photos total

Step 2: Save Your Photos
------------------------
Create a folder on your desktop:
  C:\\Users\\HP\\Desktop\\roomscale_photos

Save all your photos there.

Step 3: Run This Script to Prepare Dataset
------------------------------------------
Once you have photos ready, run:

  python ml/collect_photos.py --input "C:/Users/HP/Desktop/roomscale_photos"

This will:
  - Check your photos
  - Generate synthetic labels (you can refine later)
  - Add them to the training dataset

Step 4: Retrain the Model
-------------------------
  python ml/train_roomscale.py --mm-per-pixel 0.2734

""")


def create_sample_instructions():
    """Create a text file with detailed instructions."""
    instructions = """
ROOMSCALE AI - PHOTO COLLECTION CHECKLIST
==========================================

[ ] Take 5 photos of your PHONE (different angles/distances)
[ ] Take 5 photos of your LAPTOP/TABLET
[ ] Take 5 photos of BOOKS (various sizes)
[ ] Take 5 photos of MUGS/CUPS
[ ] Take 5 photos of BOTTLES
[ ] Take 5 photos of OTHER OBJECTS (mouse, keyboard, remote, etc.)
[ ] Save all photos to: Desktop\\roomscale_photos\\
[ ] Total: ~30+ photos recommended

TIPS FOR BEST RESULTS:
- Use natural daylight when possible
- Avoid blurry photos
- Make sure the whole object is visible
- Try to include context (desk, table surface)
- Vary the background when possible

After taking photos, run:
  python ml/collect_photos.py --input "C:/Users/HP/Desktop/roomscale_photos"
"""
    
    output_path = Path(__file__).parent.parent / "ml" / "DATA_COLLECTION_CHECKLIST.txt"
    output_path.write_text(instructions)
    print(f"\nSaved detailed instructions to: {output_path}")
    return output_path


if __name__ == "__main__":
    print()
    create_sample_instructions()
    print("\nNow go take some photos! Then come back and run the collection script.")
