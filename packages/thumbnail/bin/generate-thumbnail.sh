#!/bin/bash

# Input image path
input_image="$1"
# Output thumbnail path
output_thumbnail="$2"
# Crop the image to 16:9 if necessary and resize to a lower resolution if height > desired_height, otherwise keep original height
desired_height=${3:-480}

# Check if input image is provided
if [[ -z "$input_image" ]]; then
  echo "Usage: $0 <input_image>"
  exit 1
fi

# Determine the input image's dimensions
dimensions=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$input_image")
width=$(echo $dimensions | cut -d',' -f1)
height=$(echo $dimensions | cut -d',' -f2)

# Calculate the target width and height to maintain a 16:9 aspect ratio
target_height=$((width * 9 / 16))
if [ $target_height -gt $height ]; then
  target_width=$((height * 16 / 9))
  target_height=$height
else
  target_width=$width
fi


if [ $target_height -le $desired_height ]; then
    final_height=$target_height
else
    final_height=$desired_height
    target_width=$((final_height * 16 / 9))
fi

# Generate the thumbnail
ffmpeg -y -i "$input_image" -vf "crop=${target_width}:${target_height},scale=${target_width}:${final_height}" -frames:v 1 "$output_thumbnail"

echo "Thumbnail generated: $output_thumbnail"