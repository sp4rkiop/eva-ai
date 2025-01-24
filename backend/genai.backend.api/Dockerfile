# Build stage with multi-platform support
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /repo

# Copy and restore dependencies
COPY ["genai.backend.api.csproj", "."]
RUN dotnet restore "./genai.backend.api.csproj"

# Copy the entire source code
COPY . .

# Use the target platform to determine the runtime identifier (RID)
ARG TARGETPLATFORM
RUN if [ "$TARGETPLATFORM" = "linux/amd64" ]; then \
    RID=linux-x64 ; \
    elif [ "$TARGETPLATFORM" = "linux/arm64" ]; then \
    RID=linux-arm64 ; \
    elif [ "$TARGETPLATFORM" = "linux/arm/v7" ]; then \
    RID=linux-arm ; \
    fi \
    && dotnet publish "./genai.backend.api.csproj" -c Release -o /app/publish -r $RID --self-contained false

# Final runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app

# Copy published application
COPY --from=build /app/publish .

# Expose ports
EXPOSE 8080
EXPOSE 8081

# Run the application
ENTRYPOINT ["dotnet", "genai.backend.api.dll"]
