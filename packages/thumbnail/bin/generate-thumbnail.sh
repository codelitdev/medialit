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

# Uploads are untrusted: open only local files, and only image formats, so a
# playlist or other container can't make ffmpeg read anything else.
input_opts=(-nostdin -format_whitelist png_pipe,jpeg_pipe,webp_pipe,gif -protocol_whitelist file)
probe_opts=(-format_whitelist png_pipe,jpeg_pipe,webp_pipe,gif -protocol_whitelist file)

# Determine the input image's dimensions
dimensions=$(ffprobe "${probe_opts[@]}" -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$input_image")
width=$(echo $dimensions | cut -d',' -f1)
height=$(echo $dimensions | cut -d',' -f2)
if [[ -z "$width" || -z "$height" ]]; then
  echo "Not a supported image: $input_image" >&2
  exit 1
fi

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
ffmpeg "${input_opts[@]}" -y -i "$input_image" -vf "crop=${target_width}:${target_height},scale=${target_width}:${final_height}" -frames:v 1 "$output_thumbnail" || exit 1

echo "Thumbnail generated: $output_thumbnail"