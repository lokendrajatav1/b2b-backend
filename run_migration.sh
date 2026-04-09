#!/bin/bash
echo "y" | npx prisma migrate dev --name add_multiple_images_to_product
